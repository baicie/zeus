import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { format } from 'prettier'
import { rolldown, VERSION as rolldownVersion } from 'rolldown'

import { transformModule } from '../../packages/core/compiler/src/index.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixtures = path.join(root, 'scripts/playground/fixtures')
const outputPath = path.join(root, 'docs/public/playground/counter.json')
const update = process.argv.includes('--update')
const bundleDirectory = path.join(root, 'temp/playground')

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

async function bundleRuntime(code: string, target: 'dom' | 'ssr') {
  const entry = `\0playground-${target}`
  const entries: Record<string, string> = {
    '@zeus-js/runtime-dom': 'runtime-dom/dist/runtime-dom.esm-bundler.js',
    '@zeus-js/runtime-ssr': 'runtime-ssr/dist/runtime-ssr.esm-bundler.js',
    '@zeus-js/signal': 'signal/dist/signal.esm-bundler.js',
  }
  const platform = target === 'dom' ? 'browser' : 'node'
  const build = await rolldown({
    input: entry,
    cwd: root,
    tsconfig: false,
    platform,
    treeshake: true,
    resolve: { conditionNames: ['production', platform, 'import', 'default'] },
    transform: {
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      target: 'es2022',
    },
    plugins: [
      {
        name: 'playground-built-entry',
        resolveId(id) {
          if (id === entry) return entry
          if (entries[id]) return path.join(root, 'packages/core', entries[id])
        },
        load(id) {
          if (id === entry) return code
        },
      },
    ],
    onwarn(warning) {
      throw new Error(`Playground bundle warning: ${warning.message}`)
    },
  })
  try {
    const { output } = await build.generate({
      format: 'esm',
      minify: true,
      sourcemap: false,
      comments: false,
    })
    if (output.length !== 1 || output[0].type !== 'chunk') {
      throw new Error('Playground size must measure one complete JS bundle.')
    }
    const chunk = output[0]
    const externalBuiltins = chunk.imports.filter(isBuiltin).sort()
    if (
      chunk.imports.some(id => !isBuiltin(id)) ||
      chunk.dynamicImports.length ||
      (target === 'dom' && externalBuiltins.length)
    ) {
      throw new Error(
        'Playground bundle must include every runtime dependency.',
      )
    }
    const modules = Object.keys(chunk.modules)
      .filter(id => id !== entry && !id.startsWith('\0'))
      .map(id => path.relative(root, id).split(path.sep).join('/'))
      .sort()
    if (
      !modules.some(id =>
        id.startsWith(`packages/core/runtime-${target}/dist/`),
      ) ||
      !modules.some(id => id.startsWith('packages/core/signal/dist/'))
    ) {
      throw new Error(
        'Playground bundle did not include the runtime and signals.',
      )
    }
    mkdirSync(bundleDirectory, { recursive: true })
    writeFileSync(
      path.join(bundleDirectory, `${target}.bundle.mjs`),
      chunk.code,
    )
    return { platform, ...size(chunk.code), modules, externalBuiltins }
  } finally {
    await build.close()
  }
}

const domBundle = await bundleRuntime(dom.code, 'dom')
const ssrBundle = await bundleRuntime(ssr.code, 'ssr')

const result = {
  schemaVersion: 2,
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
  bundleSize: {
    label:
      '导出的 Counter 及全部传递 runtime 包依赖；生产模式、tree-shaking、压缩后的单个 ESM bundle。不含页面 HTML/CSS、挂载入口或 hydration；Node 内置模块由宿主提供。',
    tool: `Rolldown ${rolldownVersion}`,
    format: 'esm',
    target: 'es2022',
    minify: true,
    treeShaking: true,
    compression: 'Node zlib gzip/Brotli 默认参数；数值为字节数',
    dom: domBundle,
    ssr: ssrBundle,
  },
}

const output = await format(JSON.stringify(result), { parser: 'json' })

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
