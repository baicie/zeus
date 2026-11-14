/**
 * The vendored dialog provenance has to fail for the right reasons.
 *
 * Each case builds a tiny fixture directory and its provenance, then breaks one
 * property. A single happy-path test would pass just as well against a checker
 * that only compares two strings, which is what this replaced: `contentDigest`
 * was printed and never recomputed, so a tampered file list would still print a
 * digest and exit 0.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  VENDORED_SCHEMA,
  contentDigestOf,
  isSafeRelativePath,
  verifyVendoredDirectory,
  walkVendorDirectory,
} from '../vendored-provenance'

const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

interface Fixture {
  readonly directory: string
  readonly provenance: Record<string, unknown>
  write(relative: string, contents: string): void
  read(): unknown
  save(document: unknown): void
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents).digest('hex')
}

/** A minimal vendored package: a manifest, a dist entry and a chunk. */
function fixture(): Fixture {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vendored-'))
  temporary.push(directory)
  const files: Record<string, string> = {
    'package.json': JSON.stringify({
      name: '@zeus-web/dialog',
      version: '0.1.0-beta.35',
    }),
    'dist/index.js': 'export const fixed = true\n',
    'dist/chunks/chunk-a.js': 'export const a = 1\n',
  }
  const write = (relative: string, contents: string): void => {
    const absolute = path.join(directory, relative)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, contents)
  }
  for (const [relative, contents] of Object.entries(files)) {
    write(relative, contents)
  }
  const list = Object.entries(files)
    .map(([relative, contents]) => ({
      path: relative,
      sha256: sha256(contents),
      bytes: Buffer.byteLength(contents),
    }))
    .sort((left, right) => (left.path < right.path ? -1 : 1))
  const document = {
    schema: VENDORED_SCHEMA,
    package: '@zeus-web/dialog',
    version: '0.1.0-beta.35',
    commit: '74662b614e209e38a7b2b4557aa28df01141be25',
    contentDigest: contentDigestOf(list),
    files: list,
  }
  const provenancePath = path.join(directory, 'provenance.json')
  fs.writeFileSync(provenancePath, JSON.stringify(document, null, 2))
  return {
    directory,
    provenance: document,
    write,
    read: () => JSON.parse(fs.readFileSync(provenancePath, 'utf8')),
    save: value => {
      fs.writeFileSync(provenancePath, JSON.stringify(value, null, 2))
    },
  }
}

describe('a valid vendored build', () => {
  it('passes', () => {
    const build = fixture()
    const result = verifyVendoredDirectory(build.directory, build.read())
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('produces the same digest regardless of file order', () => {
    const files = [
      { path: 'b.js', sha256: sha256('b') },
      { path: 'a.js', sha256: sha256('a') },
    ]
    expect(contentDigestOf(files)).toBe(contentDigestOf([...files].reverse()))
  })

  it('ignores provenance.json itself', () => {
    const build = fixture()
    const walked = walkVendorDirectory(build.directory)
    expect(walked.files.map(file => file.path)).not.toContain('provenance.json')
  })
})

describe('a tampered vendored build', () => {
  it('fails when a file is modified', () => {
    const build = fixture()
    build.write('dist/index.js', 'export const fixed = false\n')
    const result = verifyVendoredDirectory(build.directory, build.read())
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/file changed since provenance/)
  })

  it('fails when a registered file is missing', () => {
    const build = fixture()
    fs.rmSync(path.join(build.directory, 'dist/chunks/chunk-a.js'))
    const result = verifyVendoredDirectory(build.directory, build.read())
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/missing from the directory/)
  })

  it('fails when an unregistered file is added', () => {
    const build = fixture()
    build.write('dist/backdoor.js', 'export const evil = true\n')
    const result = verifyVendoredDirectory(build.directory, build.read())
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/unregistered file/)
  })

  it('fails when the provenance omits a file that exists', () => {
    const build = fixture()
    const document = build.read() as Record<string, unknown>
    document.files = (document.files as unknown[]).filter(
      entry => (entry as { path: string }).path !== 'dist/chunks/chunk-a.js',
    )
    document.contentDigest = contentDigestOf(
      document.files as { path: string; sha256: string }[],
    )
    const result = verifyVendoredDirectory(build.directory, document)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/unregistered file/)
  })

  it('fails when contentDigest is tampered with', () => {
    const build = fixture()
    const document = build.read() as Record<string, unknown>
    document.contentDigest = `sha256:${'0'.repeat(64)}`
    const result = verifyVendoredDirectory(build.directory, document)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/contentDigest does not match/)
  })

  it('fails when the package name disagrees with package.json', () => {
    const build = fixture()
    const document = build.read() as Record<string, unknown>
    document.package = '@zeus-web/not-dialog'
    const result = verifyVendoredDirectory(build.directory, document)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/provenance names/)
  })

  it('fails when the version disagrees with package.json', () => {
    const build = fixture()
    const document = build.read() as Record<string, unknown>
    document.version = '0.1.0-beta.34'
    const result = verifyVendoredDirectory(build.directory, document)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/version/)
  })

  it('fails when the commit is not a full SHA', () => {
    const build = fixture()
    const document = build.read() as Record<string, unknown>
    document.commit = '74662b6'
    const result = verifyVendoredDirectory(build.directory, document)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/full 40-character/)
  })

  it('fails when a path is listed twice', () => {
    const build = fixture()
    const document = build.read() as Record<string, unknown>
    const files = document.files as { path: string }[]
    files.push({ ...files[0] } as { path: string })
    const result = verifyVendoredDirectory(build.directory, document)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/listed twice/)
  })

  it('fails when a path escapes the directory', () => {
    const build = fixture()
    const document = build.read() as Record<string, unknown>
    const files = document.files as { path: string }[]
    files.push({ path: '../../etc/passwd', sha256: sha256('x') } as {
      path: string
    })
    const result = verifyVendoredDirectory(build.directory, document)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/escapes the directory/)
  })

  it('fails when a symbolic link is present', () => {
    const build = fixture()
    // A link is neither a regular file nor a directory; following it would let
    // the digest cover bytes outside the commit.
    try {
      fs.symlinkSync('/etc/hosts', path.join(build.directory, 'dist/link.js'))
    } catch {
      // Windows without developer mode cannot create symlinks; the rule is
      // still asserted by the path check above.
      return
    }
    const result = verifyVendoredDirectory(build.directory, build.read())
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/symbolic links are not allowed/)
  })

  it('fails when the recorded byte count disagrees with disk', () => {
    const build = fixture()
    const document = build.read() as Record<string, unknown>
    const files = document.files as { path: string; bytes: number }[]
    const entry = files.find(file => file.path === 'dist/index.js')
    entry!.bytes = 999
    const result = verifyVendoredDirectory(build.directory, document)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/file size changed/)
  })
})

describe('isSafeRelativePath', () => {
  it.each([
    ['dist/index.js', true],
    ['a/b/c.js', true],
    ['../escape.js', false],
    ['a/../../escape.js', false],
    ['/absolute.js', false],
    ['a\\b.js', false],
    ['', false],
    ['./a.js', false],
    ['a//b.js', false],
  ])('%s -> %s', (value, expected) => {
    expect(isSafeRelativePath(value)).toBe(expected)
  })
})
