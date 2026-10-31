// Compare the Vue-derived signal modules with an installed @vue/reactivity
// development CJS build. This only reports differences for triage; it never
// copies or overwrites source. See docs/adr/reactivity-upstream-ledger.md.
//
// Usage (repository root, POSIX `diff` required):
//   node packages/core/signal/scripts/upstream-diff.mjs [--vue-path <dir>] [--out <dir>]
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(packageDir, '../../..')
const ts = createRequire(join(root, 'package.json'))('typescript')

// [Zeus source file, first upstream marker, next upstream marker]
const modules = [
  ['effectScope.ts', 'let activeEffectScope;', 'let activeSub;'],
  ['effect.ts', 'let activeSub;', 'let globalVersion = 0;'],
  ['dep.ts', 'let globalVersion = 0;', 'function reactiveReadArray('],
  [
    'arrayInstrumentations.ts',
    'function reactiveReadArray(',
    'const isNonTrackableKeys',
  ],
  ['baseHandlers.ts', 'const isNonTrackableKeys', 'const toShallow = '],
  ['collectionHandlers.ts', 'const toShallow = ', 'const reactiveMap = '],
  ['reactive.ts', 'const reactiveMap = ', 'function isRef('],
  ['ref.ts', 'function isRef(', 'class ComputedRefImpl'],
  ['computed.ts', 'class ComputedRefImpl', 'const TrackOpTypes = '],
  ['watch.ts', 'const INITIAL_WATCHER_VALUE', 'exports.ARRAY_ITERATE_KEY'],
]

function option(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : resolve(process.argv[index + 1])
}

function findVuePath() {
  const store = join(root, 'node_modules/.pnpm')
  const found = existsSync(store)
    ? readdirSync(store)
        .filter(name => name.startsWith('@vue+reactivity@'))
        .sort()
    : []
  if (found.length === 0)
    throw new Error('@vue/reactivity is not installed; pass --vue-path')
  return join(store, found.at(-1), 'node_modules/@vue/reactivity')
}

function normalize(code) {
  return code
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?$/gm, '')
    .replace(/^export\s*\{[\s\S]*?\};?$/gm, '')
    .replace(/^export (default )?/gm, '')
    .replace(/\/\*\s*@__\w+__\s*\*\//g, '')
    .replace(/\bshared\./g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^(\/\/|\/\*|\*)/.test(line))
    .join('\n')
}

const vuePath = option('--vue-path') ?? findVuePath()
const vuePackage = JSON.parse(
  readFileSync(join(vuePath, 'package.json'), 'utf8'),
)
const upstream = readFileSync(join(vuePath, 'dist/reactivity.cjs.js'), 'utf8')
const upstreamLines = upstream.split('\n')
const out =
  option('--out') ?? mkdtempSync(join(tmpdir(), 'zeus-upstream-diff-'))
mkdirSync(out, { recursive: true })

const lineOf = marker => {
  const index = upstreamLines.findIndex(line => line.startsWith(marker))
  if (index === -1) throw new Error(`Upstream marker not found: ${marker}`)
  return index
}

const report = []
for (const [file, start, end] of modules) {
  const from = lineOf(start)
  const to = lineOf(end)
  const source = readFileSync(join(packageDir, 'src', file), 'utf8')
  const zeus = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
    },
  }).outputText
  const base = file.replace(/\.ts$/, '')
  const upstreamFile = join(out, `${base}.upstream.js`)
  const zeusFile = join(out, `${base}.zeus.js`)
  writeFileSync(
    upstreamFile,
    `${normalize(upstreamLines.slice(from, to).join('\n'))}\n`,
  )
  writeFileSync(zeusFile, `${normalize(zeus)}\n`)
  const result = spawnSync('diff', ['-U2', upstreamFile, zeusFile], {
    encoding: 'utf8',
  })
  if (result.status !== 0 && result.status !== 1)
    throw new Error(result.stderr || 'diff failed')
  writeFileSync(join(out, `${base}.diff`), result.stdout)
  const changed = result.stdout
    .split('\n')
    .filter(line => /^[-+](?![-+]{2} )/.test(line)).length
  report.push({
    file,
    upstream: `dist/reactivity.cjs.js:${from + 1}-${to}`,
    changedLines: changed,
  })
}

console.log(
  JSON.stringify(
    {
      upstream: {
        name: vuePackage.name,
        version: vuePackage.version,
        gitHead: vuePackage.gitHead ?? null,
      },
      out,
      modules: report,
    },
    null,
    2,
  ),
)
