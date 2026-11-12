// Bundles the image size gate into a single dependency-free ES module.
//
// `admin-image.yml` runs this file with the Node already on the runner: that
// job never installs the repository's dependencies, so anything the bundle
// imports beyond `node:` builtins would not resolve. See the header of
// scripts/release/image-size-gate-cli.ts for the failure this replaces.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
// The bundle must not sit beside its source: a sibling `image-size-gate.mjs`
// wins the module resolution order over `image-size-gate.ts`, which made Vitest
// load the bundle (whose only export is a side effect) instead of the source.
const outfile = path.join(root, 'scripts/release/dist/image-size-gate.mjs')

execFileSync(
  path.join(root, 'node_modules/.bin/rolldown'),
  [
    'scripts/release/image-size-gate-cli.ts',
    '--format',
    'esm',
    '--platform',
    'node',
    '--file',
    outfile,
  ],
  { cwd: root, stdio: 'inherit' },
)

const bundled = fs.readFileSync(outfile, 'utf8')
const imports = [
  ...bundled.matchAll(/^import\s[^\n]*?from\s+["']([^"']+)["']/gm),
]
  .map(match => match[1])
  .filter(specifier => !specifier.startsWith('node:'))

if (imports.length > 0) {
  console.error(
    `image-size-gate bundle imports non-builtin modules: ${imports.join(', ')}`,
  )
  process.exit(1)
}

console.log(
  `bundled ${(fs.statSync(outfile).size / 1024).toFixed(1)} kB -> ${path.relative(root, outfile)}`,
)
