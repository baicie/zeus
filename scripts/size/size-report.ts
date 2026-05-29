import { existsSync, statSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

import { findWorkspacePackages } from '../shared/utils'

type SizeTarget = {
  name: string
  file: string
  limit?: number
}

const targets: SizeTarget[] = [
  {
    name: '@zeus-js/signal',
    file: 'dist/signal.esm-browser.prod.js',
    limit: 22,
  },
  {
    name: '@zeus-js/runtime-dom',
    file: 'dist/runtime-dom.esm-browser.prod.js',
    limit: 32,
  },
  {
    name: '@zeus-js/zeus',
    file: 'dist/zeus.esm-browser.prod.js',
    limit: 30,
  },
  {
    name: '@zeus-js/compiler',
    file: 'dist/compiler.esm-bundler.js',
    limit: 400,
  },
  {
    name: '@zeus-js/vite-plugin',
    file: 'dist/vite-plugin.esm-bundler.js',
    limit: 10,
  },
]

const ci = process.argv.includes('--ci')

console.log('\nPackage size report\n')

const wsPkgs = findWorkspacePackages()
const wsPkgsByShort = new Map(wsPkgs.map(p => [p.shortName, p]))

let hasMissing = false
let hasRegression = false

for (const target of targets) {
  const pkg = wsPkgsByShort.get(target.name.replace('@zeus-js/', ''))
  if (!pkg) {
    console.log(`${target.name}: package not found in workspace`)
    hasMissing = true
    continue
  }

  const resolvedPath = path.resolve(pkg.dir, target.file)

  if (!existsSync(resolvedPath)) {
    console.log(`${target.name}: missing ${target.file}`)
    hasMissing = true
    continue
  }

  const raw = readFileSync(resolvedPath)
  const gzip = gzipSync(raw)
  const rawKb = statSync(resolvedPath).size / 1024
  const gzipKb = gzip.length / 1024

  const marker =
    ci && target.limit
      ? rawKb > target.limit
        ? ' \x1b[31m[REGRESSION]\x1b[0m'
        : ' \x1b[32m[OK]\x1b[0m'
      : ''

  console.log(`${target.name}${marker}`)
  console.log(`  file: ${target.file}`)
  console.log(`  raw:  ${rawKb.toFixed(2)} KB`)
  console.log(`  gzip: ${gzipKb.toFixed(2)} KB`)
  if (target.limit) {
    console.log(`  limit: ${target.limit} KB`)
  }
  console.log('')

  if (ci && target.limit && rawKb > target.limit) {
    hasRegression = true
    console.error(
      `  \x1b[31mFAIL\x1b[0m: ${target.name} exceeds limit (${rawKb.toFixed(2)} KB > ${target.limit} KB)`,
    )
  }
}

if (hasMissing) {
  console.error('\nMissing files detected.\n')
  process.exit(1)
}

if (hasRegression) {
  console.error('\nSize regression detected. Run `pnpm size` to inspect.\n')
  process.exit(1)
}

if (!ci) {
  console.log('Tip: run `pnpm size --ci` to enforce limits.\n')
} else {
  console.log('\nAll size checks passed.\n')
}
