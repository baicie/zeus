/**
 * The provenance contract for a vendored build, and the code that proves it.
 *
 * `vendor/zeus-web-dialog` is a build this repository committed because npm has
 * no version of it. That makes the directory supply-chain input: whatever it
 * contains is what Admin ships. A manifest that records a digest nobody
 * recomputes is decoration, so everything here is derived from bytes on disk.
 *
 * The digest covers the *canonical file list*, not the directory as walked: the
 * list is sorted by path, each entry carries the path and its sha256, and the
 * digest is sha256 over that JSON. Two checkouts of the same commit therefore
 * produce the same digest regardless of filesystem order.
 *
 * Split from the CLI (`verify-vendored-dialog.ts`) so the rules can be tested
 * against fixtures instead of only against the one real directory.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const VENDORED_SCHEMA = 'zeus-web.vendored-build/v1'

export const PROVENANCE_FILE = 'provenance.json'

export interface VendoredFile {
  readonly path: string
  readonly sha256: string
  readonly bytes?: number
}

export interface Provenance {
  readonly schema?: string
  readonly package: string
  readonly version: string
  readonly commit: string
  readonly contentDigest: string
  readonly files: readonly VendoredFile[]
  readonly rewrites?: readonly string[]
  readonly note?: string
}

export interface VendorFileEntry {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

const SHA256_HEX = /^[0-9a-f]{64}$/
const CONTENT_DIGEST = /^sha256:[0-9a-f]{64}$/
const FULL_COMMIT = /^[0-9a-f]{40}$/

/**
 * The canonical digest of a file list.
 *
 * Sorted by path so the value does not depend on directory iteration order,
 * and built from `{path, sha256}` only: `bytes` is derivable from the file and
 * including it would make the digest change for a reason that is not content.
 */
export function contentDigestOf(files: readonly VendoredFile[]): string {
  const canonical = [...files]
    .map(file => ({ path: file.path, sha256: file.sha256 }))
    .sort((left, right) => (left.path < right.path ? -1 : 1))
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')}`
}

export type VendorWalkError = { readonly path: string; readonly reason: string }

export interface VendorWalkResult {
  readonly files: VendorFileEntry[]
  readonly errors: VendorWalkError[]
}

/**
 * Every file in the vendored directory, with its digest.
 *
 * Symbolic links are rejected rather than followed. A link can point outside
 * the repository, which would let the digest cover bytes that are not in the
 * commit, and following one silently is exactly the failure mode this check
 * exists to catch.
 */
export function walkVendorDirectory(directory: string): VendorWalkResult {
  const files: VendorFileEntry[] = []
  const errors: VendorWalkError[] = []
  const walk = (current: string, prefix: string): void => {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = path.join(current, entry.name)
      // The provenance describes the package; it is not part of it.
      if (relative === PROVENANCE_FILE) continue
      if (entry.isSymbolicLink()) {
        errors.push({
          path: relative,
          reason: 'symbolic links are not allowed',
        })
        continue
      }
      if (entry.isDirectory()) {
        walk(absolute, relative)
        continue
      }
      if (!entry.isFile()) {
        errors.push({
          path: relative,
          reason: 'not a regular file or directory',
        })
        continue
      }
      const contents = fs.readFileSync(absolute)
      files.push({
        path: relative,
        sha256: createHash('sha256').update(contents).digest('hex'),
        bytes: contents.byteLength,
      })
    }
  }
  walk(directory, '')
  return { files, errors }
}

export interface VerificationResult {
  readonly ok: boolean
  readonly errors: readonly string[]
}

/**
 * Whether a relative path stays inside the directory it is resolved against.
 *
 * Provenance is committed data, but it is data a future edit could get wrong,
 * and a path like `../../etc/passwd` in a file list would otherwise be read as
 * a normal entry.
 */
export function isSafeRelativePath(value: string): boolean {
  if (value.length === 0) return false
  if (value.startsWith('/')) return false
  if (value.includes('\\')) return false
  if (value.includes('\0')) return false
  const segments = value.split('/')
  return segments.every(
    segment => segment !== '' && segment !== '.' && segment !== '..',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates a provenance document against itself and against the directory it
 * describes. Every rule here exists because its absence would let a directory
 * pass while not being the build the manifest claims.
 */
export function verifyVendoredDirectory(
  directory: string,
  document: unknown,
): VerificationResult {
  const errors: string[] = []
  const fail = (message: string): void => {
    errors.push(message)
  }

  if (!isRecord(document)) {
    return { ok: false, errors: ['provenance must be a JSON object'] }
  }
  const provenance = document as unknown as Provenance

  // 1. Shape.
  if (provenance.schema !== VENDORED_SCHEMA) {
    fail(`schema must be ${VENDORED_SCHEMA}`)
  }
  if (typeof provenance.package !== 'string' || provenance.package === '') {
    fail('package must be a non-empty string')
  }
  if (typeof provenance.version !== 'string' || provenance.version === '') {
    fail('version must be a non-empty string')
  }
  if (
    typeof provenance.commit !== 'string' ||
    !FULL_COMMIT.test(provenance.commit)
  ) {
    fail('commit must be a full 40-character lowercase hex SHA')
  }
  if (
    typeof provenance.contentDigest !== 'string' ||
    !CONTENT_DIGEST.test(provenance.contentDigest)
  ) {
    fail('contentDigest must be sha256:<64 hex>')
  }
  if (!Array.isArray(provenance.files)) {
    fail('files must be an array')
    return { ok: false, errors }
  }

  // 2. The directory it actually describes.
  const manifestPath = path.join(directory, 'package.json')
  if (!fs.existsSync(manifestPath)) {
    fail(`${directory}/package.json is missing`)
  } else {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      name?: unknown
      version?: unknown
    }
    if (manifest.name !== provenance.package) {
      fail(
        `provenance names ${provenance.package} but package.json says ${String(manifest.name)}`,
      )
    }
    if (manifest.version !== provenance.version) {
      fail(
        `provenance says version ${provenance.version} but package.json says ${String(manifest.version)}`,
      )
    }
  }

  const walked = walkVendorDirectory(directory)
  for (const error of walked.errors) {
    fail(`${error.path}: ${error.reason}`)
  }
  const actual = new Map(walked.files.map(file => [file.path, file]))

  // 3. The file list: registered, present, correct, unique, inside the tree.
  const seen = new Set<string>()
  for (const [index, file] of provenance.files.entries()) {
    if (!isRecord(file)) {
      fail(`files[${index}] must be an object`)
      continue
    }
    const record = file as unknown as VendoredFile
    if (typeof record.path !== 'string') {
      fail(`files[${index}].path must be a string`)
      continue
    }
    if (!isSafeRelativePath(record.path)) {
      fail(`files[${index}].path escapes the directory: ${record.path}`)
      continue
    }
    if (seen.has(record.path)) {
      fail(`files[${index}].path is listed twice: ${record.path}`)
      continue
    }
    seen.add(record.path)
    if (typeof record.sha256 !== 'string' || !SHA256_HEX.test(record.sha256)) {
      fail(`files[${index}].sha256 is not a sha256 hex digest`)
      continue
    }
    const onDisk = actual.get(record.path)
    if (!onDisk) {
      fail(`registered file is missing from the directory: ${record.path}`)
      continue
    }
    if (onDisk.sha256 !== record.sha256) {
      fail(`file changed since provenance: ${record.path}`)
    }
    if (typeof record.bytes === 'number' && record.bytes !== onDisk.bytes) {
      fail(
        `file size changed since provenance: ${record.path} (${record.bytes} -> ${onDisk.bytes})`,
      )
    }
  }

  // 4. Nothing may hide: every file present must be registered.
  for (const file of walked.files) {
    if (!seen.has(file.path)) {
      fail(`unregistered file in the directory: ${file.path}`)
    }
  }

  // 5. The digest must describe the list it claims to.
  const computed = contentDigestOf(provenance.files)
  if (
    typeof provenance.contentDigest === 'string' &&
    CONTENT_DIGEST.test(provenance.contentDigest) &&
    computed !== provenance.contentDigest
  ) {
    fail(
      `contentDigest does not match the file list (recorded ${provenance.contentDigest}, computed ${computed})`,
    )
  }

  return { ok: errors.length === 0, errors }
}
