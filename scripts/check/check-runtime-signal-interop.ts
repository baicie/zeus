import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getRootDir } from '../shared/utils'

export function checkRuntimeSignalInterop(rootDir = getRootDir()): void {
  const esmZeus = path.resolve(
    rootDir,
    'packages/core/zeus/dist/zeus.esm-bundler.js',
  )
  const esmDom = path.resolve(
    rootDir,
    'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
  )
  const esmSignal = path.resolve(
    rootDir,
    'packages/core/signal/dist/signal.esm-bundler.js',
  )
  const esmInternal = path.resolve(
    rootDir,
    'packages/core/signal/dist/internal.js',
  )
  const zeusPackageJson = path.resolve(
    rootDir,
    'packages/core/zeus/package.json',
  )

  const exerciseEngine = `
const [engineValue, setEngineValue] = signal.createSignal(0)
let seen = -1
const runner = internal.effect(() => {
  seen = engineValue()
})
if (seen !== 0) throw new Error('initial engine effect failed')
setEngineValue(1)
if (seen !== 1) throw new Error('public and internal signal engines diverged')
internal.stop(runner)
`

  const exercise = `
const [value, setValue] = zeus.createSignal('before')
const text = { data: '' }
zeus.createRoot(dispose => {
  dom.bindText(text, value)
  if (text.data !== 'before') throw new Error('initial binding failed')
  setValue('after')
  if (text.data !== 'after') throw new Error('reactive update failed')
  dispose()
})
setValue('disposed')
if (text.data !== 'after') throw new Error('cross-package root disposal failed')
`

  runNode(
    'ESM bundler',
    `const [signal, internal, zeus, dom] = await Promise.all([
  import(${JSON.stringify(pathToFileURL(esmSignal).href)}),
  import(${JSON.stringify(pathToFileURL(esmInternal).href)}),
  import(${JSON.stringify(pathToFileURL(esmZeus).href)}),
  import(${JSON.stringify(pathToFileURL(esmDom).href)}),
])
${exerciseEngine}
${exercise}`,
    ['--input-type=module'],
    rootDir,
  )

  const cjsSource = `const { createRequire } = require('node:module')
const packageRequire = createRequire(${JSON.stringify(zeusPackageJson)})
const signal = packageRequire('@zeus-js/signal')
const internal = packageRequire('@zeus-js/signal/internal')
const zeus = packageRequire('@zeus-js/zeus')
const dom = packageRequire('@zeus-js/runtime-dom')
${exerciseEngine}
${exercise}
`

  runNode('CJS development', cjsSource, [], rootDir, 'development')
  runNode(
    'CJS production',
    `${cjsSource}
const internalModules = Object.keys(require.cache).filter(id =>
  /signal[\\\\/]dist[\\\\/]internal(?:\\.prod)?\\.cjs$/.test(id),
)
if (!internalModules.some(id => id.endsWith('internal.prod.cjs'))) {
  throw new Error('production internal engine was not loaded')
}
if (internalModules.some(id => id.endsWith('/internal.cjs'))) {
  throw new Error('development internal engine leaked into production')
}`,
    [],
    rootDir,
    'production',
  )
}

function runNode(
  format: string,
  source: string,
  args: string[],
  cwd: string,
  nodeEnv?: string,
): void {
  const result = spawnSync(process.execPath, [...args, '-e', source], {
    cwd,
    encoding: 'utf8',
    env: nodeEnv ? { ...process.env, NODE_ENV: nodeEnv } : process.env,
  })

  if (result.status !== 0) {
    throw new Error(
      `${format} runtime signal interoperability failed:\n${result.stderr || result.stdout}`,
    )
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  return (
    entry !== undefined &&
    path.resolve(entry) === fileURLToPath(import.meta.url)
  )
}

if (isDirectExecution()) {
  checkRuntimeSignalInterop()
  console.log(
    'Runtime signal interoperability passed for ESM and development/production CJS builds.',
  )
}
