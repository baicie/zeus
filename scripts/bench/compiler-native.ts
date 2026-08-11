import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const root = path.resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const native = require(path.join(root, 'packages/core/compiler-native')) as {
  transformModule(options: {
    source: string
    filename: string
    target: 'dom'
    runtimeModule: string
    delegateEvents: boolean
    sourceMap: boolean
  }): { code: string; diagnostics: unknown[] }
}

const source = `import { createSignal } from '@zeus-js/signal'
const [count] = createSignal(0)
export const App = () => <button onClick={() => count()}>{count()}</button>
`
const options = {
  source,
  filename: 'benchmark.tsx',
  target: 'dom' as const,
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: true,
}

const coldStart = performance.now()
const first = native.transformModule(options)
const coldMs = performance.now() - coldStart

const warmStart = performance.now()
for (let index = 0; index < 100; index++) {
  const result = native.transformModule(options)
  if (result.diagnostics.length > 0) throw new Error('benchmark fixture failed')
}
const warmMs = (performance.now() - warmStart) / 100

const binarySizes = collectSizes('packages/core/compiler-native*', '.node')
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  coldCompileMs: round(coldMs),
  warmCompileMs: round(warmMs),
  generatedBytes: Buffer.byteLength(first.code),
  nativeBinaryBytes: binarySizes,
  note: 'Legacy Babel timing is intentionally not collected after the compiler removal.',
}

const output = path.join(root, 'temp/bench/compiler-native.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))

function collectSizes(pattern: string, suffix: string): Record<string, number> {
  const prefix = pattern.replace(/\*$/, '')
  const directory = path.dirname(path.join(root, prefix))
  const namePrefix = path.basename(prefix)
  const sizes: Record<string, number> = {}
  if (!fs.existsSync(directory)) return sizes
  for (const name of fs.readdirSync(directory)) {
    if (!name.startsWith(namePrefix)) continue
    const packageDir = path.join(directory, name)
    if (!fs.statSync(packageDir).isDirectory()) continue
    for (const file of fs.readdirSync(packageDir)) {
      if (!file.endsWith(suffix)) continue
      sizes[`${name}/${file}`] = fs.statSync(path.join(packageDir, file)).size
    }
  }
  return sizes
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
