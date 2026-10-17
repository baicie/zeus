import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { rolldown } from 'rolldown'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(packageDir, '../../..')
const baselineRef = process.argv[2] ?? 'HEAD'
const baselineCommit = execFileSync('git', ['rev-parse', baselineRef], { cwd: root, encoding: 'utf8' }).trim()
const fixture = mkdtempSync(join(tmpdir(), 'zeus-engine-boundary-'))
const iterations = 100_000
const warmup = 10_000
const rounds = 7

async function bundle(entry, name) {
  const build = await rolldown({
    input: entry,
    resolve: { alias: { '@zeus-js/shared': join(root, 'packages/core/shared/src/index.ts') } },
    transform: { define: { __DEV__: 'false', __TEST__: 'false', __VERSION__: '"audit"' } },
  })
  const file = join(fixture, `${name}.mjs`)
  try { await build.write({ file, format: 'es', minify: true }) } finally { await build.close() }
  return import(pathToFileURL(file).href)
}

function measure(engine, diamond) {
  const [read, write] = engine.createSignal(0)
  const left = diamond ? engine.createMemo(() => read() * 2) : read
  const right = diamond ? engine.createMemo(() => read() * 3) : () => 0
  let calls = 0
  let value = 0
  const dispose = engine.createRoot(stop => {
    engine.createEffect(() => { calls++; value = left() + right() })
    return stop
  })
  for (let index = 1; index <= warmup; index++) write(index)
  const start = performance.now()
  for (let index = warmup + 1; index <= warmup + iterations; index++) write(index)
  const elapsed = performance.now() - start
  assert.equal(value, (warmup + iterations) * (diamond ? 5 : 1))
  assert.equal(calls, warmup + iterations + 1)
  dispose()
  return elapsed
}

try {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baselineCommit, 'packages/core/signal/src'], { cwd: root, encoding: 'utf8' }).trim().split('\n')
  for (const file of files) {
    const target = join(fixture, 'baseline', file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, execFileSync('git', ['show', `${baselineCommit}:${file}`], { cwd: root }))
  }
  const baseline = await bundle(join(fixture, 'baseline/packages/core/signal/src/internal.ts'), 'baseline')
  const current = await bundle(join(packageDir, 'src/internal.ts'), 'current')
  const samples = { oneEffect: { baseline: [], current: [] }, diamond: { baseline: [], current: [] } }
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 === 0 ? [['baseline', baseline], ['current', current]] : [['current', current], ['baseline', baseline]]
    for (const [name, engine] of order) {
      samples.oneEffect[name].push(measure(engine, false))
      samples.diamond[name].push(measure(engine, true))
    }
  }
  const result = Object.fromEntries(Object.entries(samples).map(([scenario, engines]) => {
    const summarized = Object.fromEntries(Object.entries(engines).map(([name, values]) => {
      values.sort((left, right) => left - right)
      return [name, { medianMs: Number(values[Math.floor(values.length / 2)].toFixed(3)), samplesMs: values.map(value => Number(value.toFixed(3))) }]
    }))
    return [scenario, { ...summarized, changePercent: Number(((summarized.current.medianMs / summarized.baseline.medianMs - 1) * 100).toFixed(1)) }]
  }))
  console.log(JSON.stringify({ environment: { node: process.version, platform: process.platform, arch: process.arch }, baselineCommit, method: { iterations, warmup, rounds, order: 'alternating baseline/current per round', scope: 'same minified Rolldown configuration; baseline Git source vs current working source; includes boundary checks and owner/error contract fixes; setup/disposal excluded' }, result }, null, 2))
} finally {
  rmSync(fixture, { recursive: true, force: true })
}
