import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

type SizeTarget = {
  name: string
  file: string
}

const targets: SizeTarget[] = [
  {
    name: '@zeus-js/signal',
    file: 'packages/signal/dist/signal.esm-browser.prod.js',
  },
  {
    name: '@zeus-js/runtime-dom',
    file: 'packages/runtime-dom/dist/runtime-dom.esm-browser.prod.js',
  },
  {
    name: '@zeus-js/zeus',
    file: 'packages/zeus/dist/zeus.esm-browser.prod.js',
  },
  {
    name: '@zeus-js/compiler',
    file: 'packages/compiler/dist/compiler.esm-bundler.js',
  },
  {
    name: '@zeus-js/vite-plugin',
    file: 'packages/vite-plugin/dist/vite-plugin.esm-bundler.js',
  },
]

console.log('\nPackage size report\n')

let hasMissing = false

for (const target of targets) {
  const path = resolve(process.cwd(), target.file)

  if (!existsSync(path)) {
    console.log(`${target.name}: missing ${target.file}`)
    hasMissing = true
    continue
  }

  const raw = readFileSync(path)
  const gzip = gzipSync(raw)

  console.log(`${target.name}`)
  console.log(`  file: ${target.file}`)
  console.log(`  raw:  ${(statSync(path).size / 1024).toFixed(2)} KB`)
  console.log(`  gzip: ${(gzip.length / 1024).toFixed(2)} KB`)
  console.log('')
}

if (hasMissing) {
  process.exit(1)
}
