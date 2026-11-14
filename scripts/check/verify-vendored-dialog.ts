/**
 * Proves the `@zeus-web/dialog` Admin installs is the build this repository
 * vendored — not merely a package with the same version string.
 *
 * `examples/admin/package.json` points at `vendor/zeus-web-dialog`, a build
 * made from a specific commit because npm does not have it yet. A version
 * number is not evidence of that: two builds of the same `package.json` can
 * differ, and a re-install can quietly bring back the published one. The last
 * time this went wrong the vendored copy reached CI with a manifest and no
 * code, and the failure surfaced as a TypeScript error three steps away.
 *
 * So this compares content: every file the provenance lists, by digest, plus
 * the two symbols the dialog fix records. Run by `check:admin` before the
 * browser gates, and standalone as `pnpm check:vendored-dialog`.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '../..')
const vendored = path.join(root, 'vendor/zeus-web-dialog')
const installed = path.join(root, 'examples/admin/node_modules/@zeus-web/dialog')

interface Provenance {
  readonly package: string
  readonly version: string
  readonly commit: string
  readonly contentDigest: string
  readonly files: readonly { path: string; sha256: string }[]
}

/** Symbols the fixed build records; absence means the fix is not in it. */
const REQUIRED_MARKERS = [
  '@zeus-web/dialog/state',
  '@zeus-web/dialog/consumed-escapes',
]

function fail(message: string): never {
  console.error(`vendored dialog: ${message}`)
  process.exit(1)
}

function manifestVersion(directory: string): string {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
  ) as { version?: string; name?: string }
  if (!manifest.version) fail(`${directory}/package.json has no version`)
  return manifest.version as string
}

function digestOf(directory: string): Map<string, string> {
  const digests = new Map<string, string>()
  const walk = (current: string, prefix: string): void => {
    for (const entry of fs
      .readdirSync(current, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : 1))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolute = path.join(current, entry.name)
      // The provenance describes the package; it is not part of the package.
      if (relative === 'provenance.json') continue
      if (entry.isDirectory()) walk(absolute, relative)
      else if (entry.isFile()) {
        digests.set(
          relative,
          createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),
        )
      }
    }
  }
  walk(directory, '')
  return digests
}

const provenancePath = path.join(vendored, 'provenance.json')
if (!fs.existsSync(provenancePath)) {
  fail(
    `no ${provenancePath}. A vendored build without provenance cannot say which commit it came from.`,
  )
}
const provenance = JSON.parse(
  fs.readFileSync(provenancePath, 'utf8'),
) as Provenance

// 1. The vendored directory still is the build the provenance describes.
const vendoredDigests = digestOf(vendored)
const missing = provenance.files.filter(
  file => !vendoredDigests.has(file.path),
)
if (missing.length > 0) {
  fail(
    `vendored files are missing: ${missing.map(file => file.path).slice(0, 5).join(', ')}. ` +
      'The commit shipped a manifest without its code once; this is that shape.',
  )
}
const changed = provenance.files.filter(
  file => vendoredDigests.get(file.path) !== file.sha256,
)
if (changed.length > 0) {
  fail(
    `vendored files changed since provenance: ${changed.map(file => file.path).slice(0, 5).join(', ')}`,
  )
}

// 2. What Admin installed is that directory, file for file.
if (!fs.existsSync(installed)) {
  fail(`Admin has no @zeus-web/dialog installed at ${installed}`)
}
const installedVersion = manifestVersion(installed)
if (installedVersion !== provenance.version) {
  fail(
    `Admin installed ${installedVersion} but the vendored build is ${provenance.version}`,
  )
}
const installedDigests = digestOf(installed)
for (const [file, digest] of vendoredDigests) {
  if (!installedDigests.has(file)) {
    fail(`Admin's install is missing ${file}`)
  }
  if (installedDigests.get(file) !== digest) {
    fail(`Admin's ${file} differs from the vendored build`)
  }
}

// 3. And it is the build with the fix, not a same-version rebuild without it.
const entry = fs.readFileSync(
  path.join(installed, 'dist/wc/zw-dialog.entry.js'),
  'utf8',
)
const absent = REQUIRED_MARKERS.filter(marker => !entry.includes(marker))
if (absent.length > 0) {
  fail(
    `the installed build is missing ${absent.join(', ')}; it is not a build of ${provenance.commit}`,
  )
}

console.log(
  `vendored dialog ok: ${provenance.package}@${provenance.version} from ${provenance.commit.slice(0, 8)}`,
)
console.log(`  content: ${provenance.contentDigest}`)
console.log(`  files:   ${vendoredDigests.size}`)
