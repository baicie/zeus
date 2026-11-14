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
 * The rules live in `vendored-provenance.ts` so they can be tested against
 * fixtures. This file is the CLI: it applies them to the real directory, then
 * checks that what Admin installed is byte-identical to it, and that the
 * installed build is the one carrying the dialog fix.
 *
 * Run by `check:admin` before the browser gates, and standalone as
 * `pnpm check:vendored-dialog`.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import {
  PROVENANCE_FILE,
  verifyVendoredDirectory,
  walkVendorDirectory,
} from './vendored-provenance'

const root = path.resolve(import.meta.dirname, '../..')
const vendored = path.join(root, 'vendor/zeus-web-dialog')
const installed = path.join(
  root,
  'examples/admin/node_modules/@zeus-web/dialog',
)

/** Symbols the fixed build records; absence means the fix is not in it. */
const REQUIRED_MARKERS = [
  '@zeus-web/dialog/state',
  '@zeus-web/dialog/consumed-escapes',
]

function fail(message: string): never {
  console.error(`vendored dialog: ${message}`)
  process.exit(1)
}

const provenancePath = path.join(vendored, PROVENANCE_FILE)
if (!fs.existsSync(provenancePath)) {
  fail(
    `no ${provenancePath}. A vendored build without provenance cannot say which commit it came from.`,
  )
}

const document = JSON.parse(fs.readFileSync(provenancePath, 'utf8')) as unknown

// 1. The vendored directory is the build the provenance describes.
const verification = verifyVendoredDirectory(vendored, document)
if (!verification.ok) {
  fail(
    `provenance does not describe ${vendored}:\n  ${verification.errors
      .slice(0, 10)
      .join('\n  ')}`,
  )
}

const provenance = document as {
  package: string
  version: string
  commit: string
  contentDigest: string
}
const vendoredFiles = walkVendorDirectory(vendored).files

// 2. What Admin installed is that directory, file for file.
if (!fs.existsSync(installed)) {
  fail(`Admin has no @zeus-web/dialog installed at ${installed}`)
}
const installedManifest = JSON.parse(
  fs.readFileSync(path.join(installed, 'package.json'), 'utf8'),
) as { version?: string }
if (installedManifest.version !== provenance.version) {
  fail(
    `Admin installed ${String(installedManifest.version)} but the vendored build is ${provenance.version}`,
  )
}

const installedWalk = walkVendorDirectory(installed)
if (installedWalk.errors.length > 0) {
  fail(
    `Admin's install contains entries a vendored build may not have: ${installedWalk.errors
      .map(error => `${error.path} (${error.reason})`)
      .join(', ')}`,
  )
}
const installedByPath = new Map(
  installedWalk.files.map(file => [file.path, file.sha256]),
)
for (const file of vendoredFiles) {
  if (!installedByPath.has(file.path)) {
    fail(`Admin's install is missing ${file.path}`)
  }
  if (installedByPath.get(file.path) !== file.sha256) {
    fail(`Admin's ${file.path} differs from the vendored build`)
  }
}
// A stale file left behind by an earlier version is a difference too.
for (const file of installedWalk.files) {
  if (!vendoredFiles.some(entry => entry.path === file.path)) {
    fail(`Admin's install has a file the vendored build does not: ${file.path}`)
  }
}

// 3. And it is the build with the fix, not a same-version rebuild without it.
const entryPath = path.join(installed, 'dist/wc/zw-dialog.entry.js')
if (!fs.existsSync(entryPath)) {
  fail(`Admin's install has no dist/wc/zw-dialog.entry.js`)
}
const entry = fs.readFileSync(entryPath, 'utf8')
const absent = REQUIRED_MARKERS.filter(marker => !entry.includes(marker))
if (absent.length > 0) {
  fail(
    `the installed build is missing ${absent.join(', ')}; it is not a build of ${provenance.commit}`,
  )
}

const installDigest = createHash('sha256')
  .update(
    installedWalk.files
      .map(file => `${file.sha256}  ${file.path}`)
      .sort()
      .join('\n'),
  )
  .digest('hex')

console.log(
  `vendored dialog ok: ${provenance.package}@${provenance.version} from ${provenance.commit.slice(0, 8)}`,
)
console.log(`  content:   ${provenance.contentDigest}`)
console.log(`  files:     ${vendoredFiles.length}`)
console.log(`  installed: ${installDigest.slice(0, 16)}… (byte-identical)`)
