import { existsSync, statSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

import { findWorkspacePackages } from '../shared/utils'

type SizeTarget = {
  name: string
  file: string
  rawLimit?: number
  gzipLimit?: number
}

const targets: SizeTarget[] = [
  {
    name: '@zeus-js/signal',
    file: 'dist/signal.esm-browser.prod.js',
    rawLimit: 22,
    gzipLimit: 8,
  },
  {
    name: '@zeus-js/runtime-dom',
    file: 'dist/runtime-dom.esm-browser.prod.js',
    // Includes the complete exported runtime: direct bindings, control flow,
    // Web Component host support, DevTools observation and explicit hydration.
    // Baseline on 2026-10-20: 56.69 KB raw / 18.70 KB gzip.
    rawLimit: 60,
    gzipLimit: 20,
  },
  {
    name: '@zeus-js/zeus',
    file: 'dist/zeus.esm-browser.prod.js',
    // This browser entry embeds the runtime above.
    // Baseline on 2026-10-20: 47.38 KB raw / 15.77 KB gzip.
    rawLimit: 50,
    gzipLimit: 17,
  },
  {
    name: '@zeus-js/compiler',
    file: 'dist/compiler.esm-bundler.js',
    rawLimit: 400,
    gzipLimit: 100,
  },
  {
    name: '@zeus-js/vite-plugin',
    file: 'dist/vite-plugin.esm-bundler.js',
    rawLimit: 10,
    gzipLimit: 4,
  },
]

const ci = process.argv.includes('--ci')

console.log('\nPackage size report\n')

const wsPkgs = findWorkspacePackages()
const wsPkgsByShort = new Map<string, (typeof wsPkgs)[number]>()
for (const pkg of wsPkgs) {
  if (!wsPkgsByShort.has(pkg.shortName)) {
    wsPkgsByShort.set(pkg.shortName, pkg)
  }
}

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

  const exceedsRaw = Boolean(target.rawLimit && rawKb > target.rawLimit)
  const exceedsGzip = Boolean(target.gzipLimit && gzipKb > target.gzipLimit)
  const marker =
    ci && (target.rawLimit || target.gzipLimit)
      ? exceedsRaw || exceedsGzip
        ? ' \x1b[31m[REGRESSION]\x1b[0m'
        : ' \x1b[32m[OK]\x1b[0m'
      : ''

  console.log(`${target.name}${marker}`)
  console.log(`  file: ${target.file}`)
  console.log(`  raw:  ${rawKb.toFixed(2)} KB`)
  console.log(`  gzip: ${gzipKb.toFixed(2)} KB`)
  if (target.rawLimit) {
    console.log(`  raw limit:  ${target.rawLimit} KB`)
  }
  if (target.gzipLimit) {
    console.log(`  gzip limit: ${target.gzipLimit} KB`)
  }
  console.log('')

  if (ci && exceedsRaw) {
    hasRegression = true
    console.error(
      `  \x1b[31mFAIL\x1b[0m: ${target.name} raw exceeds limit (${rawKb.toFixed(2)} KB > ${target.rawLimit} KB)`,
    )
  }
  if (ci && exceedsGzip) {
    hasRegression = true
    console.error(
      `  \x1b[31mFAIL\x1b[0m: ${target.name} gzip exceeds limit (${gzipKb.toFixed(2)} KB > ${target.gzipLimit} KB)`,
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
