import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { transformModule } from '../../packages/core/compiler/src/index.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtures = path.join(root, 'scripts/playground/fixtures')
const outputPath = path.join(root, 'docs/public/playground/counter.json')
const update = process.argv.includes('--update')

const source = readFileSync(path.join(fixtures, 'counter.tsx'), 'utf8')
const invalidSource = readFileSync(path.join(fixtures, 'invalid.tsx'), 'utf8')
const ir = JSON.parse(
  readFileSync(path.join(fixtures, 'counter.ir.json'), 'utf8'),
) as Record<string, unknown>

const dom = transformModule({
  source,
  filename: 'counter.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: false,
})
const ssr = transformModule({
  source,
  filename: 'counter.tsx',
  target: 'ssr',
  runtimeModule: '@zeus-js/runtime-ssr',
  delegateEvents: false,
  sourceMap: false,
})
const invalid = transformModule({
  source: invalidSource,
  filename: 'invalid.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: false,
})

if (dom.diagnostics.length || ssr.diagnostics.length) {
  throw new Error(
    `Valid playground fixture failed to compile: ${JSON.stringify([...dom.diagnostics, ...ssr.diagnostics])}`,
  )
}
if (!dom.code || !ssr.code || !invalid.diagnostics.length) {
  throw new Error(
    'Playground must include DOM, SSR, and error compiler results.',
  )
}
if (!invalid.diagnostics.some(diagnostic => diagnostic.span)) {
  throw new Error('The diagnostic fixture must include a source span.')
}
if (!ir || ir.kind !== 'Module' || !Array.isArray(ir.components)) {
  throw new Error('The Rust internal IR snapshot is missing or invalid.')
}

const size = (code: string) => {
  const bytes = Buffer.from(code)
  return {
    raw: bytes.byteLength,
    gzip: gzipSync(bytes).byteLength,
    brotli: brotliCompressSync(bytes).byteLength,
  }
}

const result = {
  schemaVersion: 1,
  title: 'Counter',
  source,
  dom: dom.code,
  ssr: ssr.code,
  diagnostics: invalid.diagnostics,
  ir,
  irNotice:
    '由 Rust lower_module 生成的内部 IR 调试快照；不是 transformModule 返回值或稳定公共 API。',
  outputSize: {
    label: '生成的 JS 模块；不含依赖与应用打包',
    dom: size(dom.code),
    ssr: size(ssr.code),
  },
  artifactSize: { raw: 0, gzip: 0, brotli: 0 },
}

let output = ''
for (let attempt = 0; attempt < 8; attempt += 1) {
  output = `${JSON.stringify(result, null, 2)}\n`
  const measured = size(output)
  if (JSON.stringify(measured) === JSON.stringify(result.artifactSize)) break
  result.artifactSize = measured
}
if (JSON.stringify(size(output)) !== JSON.stringify(result.artifactSize)) {
  throw new Error('Could not stabilize static playground artifact size.')
}

if (update) {
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, output)
  console.log(`Updated ${path.relative(root, outputPath)}`)
} else {
  const expected = readFileSync(outputPath, 'utf8')
  if (output !== expected) {
    throw new Error(
      'Playground snapshots are stale. Run `pnpm playground:update`.',
    )
  }
  console.log('Compiler playground snapshots passed.')
}
