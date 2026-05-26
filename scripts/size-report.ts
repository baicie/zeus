import { statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const files = [
  'packages/signal/dist/signal.esm-browser.prod.js',
  'packages/runtime-dom/dist/runtime-dom.esm-browser.prod.js',
  'packages/compiler/dist/compiler.esm-bundler.js',
  'packages/zeus/dist/zeus.esm-browser.prod.js',
]

for (const file of files) {
  const path = resolve(process.cwd(), file)
  const raw = readFileSync(path)
  const gzip = gzipSync(raw)

  console.log(
    `${file}
  raw:  ${(statSync(path).size / 1024).toFixed(2)} KB
  gzip: ${(gzip.length / 1024).toFixed(2)} KB`,
  )
}
