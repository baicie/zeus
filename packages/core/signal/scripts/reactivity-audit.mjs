import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(packageDir, 'package.json'))
const signal = require('@zeus-js/signal')
const internal = require('@zeus-js/signal/internal')
const iterations = 50_000
const warmup = 5_000
const rounds = 5

function imports(source) {
  return [
    ...source.matchAll(
      /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]|\brequire\(['"]([^'"]+)['"]\)/g,
    ),
  ]
    .map(match => match[1] ?? match[2])
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort()
}

function scan(directory, extension) {
  return Object.fromEntries(
    readdirSync(join(packageDir, directory))
      .filter(name => extension.test(name))
      .sort()
      .map(name => [
        name,
        imports(readFileSync(join(packageDir, directory, name), 'utf8')),
      ]),
  )
}

const sourceGraph = scan('src', /\.ts$/)
const artifactGraph = scan('dist', /\.(?:js|cjs)$/)
assert(
  !Object.values(sourceGraph)
    .flat()
    .some(id => id.startsWith('alien-signals')),
)
assert(
  !Object.values(artifactGraph)
    .flat()
    .some(id => id.startsWith('alien-signals')),
)

const sizes = Object.fromEntries(
  [
    'signal.esm-bundler.js',
    'internal.js',
    'internal.prod.cjs',
    'signal.esm-browser.prod.js',
  ].map(name => {
    const contents = readFileSync(join(packageDir, 'dist', name))
    return [
      name,
      { bytes: contents.length, gzipBytes: gzipSync(contents).length },
    ]
  }),
)

const reference = internal.shallowState(0)
const scope = internal.effectScope(true)
const runner = scope.run(() => internal.effect(() => reference.value))
const memo = internal.computed(() => reference.value * 2)
const runtimeObjects = {
  ref: reference.constructor.name,
  dependency: reference.dep.constructor.name,
  effect: runner.effect.constructor.name,
  memo: memo.constructor.name,
  scope: scope.constructor.name,
}
scope.stop()

function measure(adapter, diamond) {
  const samples = []
  for (let round = 0; round < rounds; round++) {
    const [read, write] = adapter.signal(0)
    const left = diamond ? adapter.memo(() => read() * 2) : read
    const right = diamond ? adapter.memo(() => read() * 3) : () => 0
    let seen = 0
    let calls = 0
    const dispose = adapter.effect(() => {
      seen = left() + right()
      calls++
    })
    for (let index = 1; index <= warmup; index++) write(index)
    const start = performance.now()
    for (let index = warmup + 1; index <= warmup + iterations; index++)
      write(index)
    samples.push(performance.now() - start)
    assert.equal(seen, (warmup + iterations) * (diamond ? 5 : 1))
    assert.equal(calls, warmup + iterations + 1)
    dispose()
  }
  samples.sort((left, right) => left - right)
  return {
    medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(3)),
    samplesMs: samples.map(sample => Number(sample.toFixed(3))),
  }
}

const zeus = {
  signal: signal.createSignal,
  memo: signal.createMemo,
  effect(run) {
    return signal.createRoot(dispose => {
      signal.createEffect(run)
      return dispose
    })
  },
}
const measurements = {
  zeus: { writeOneEffect: measure(zeus, false), diamond: measure(zeus, true) },
}
const alienPathIndex = process.argv.indexOf('--alien-path')
let comparison = null
if (alienPathIndex !== -1) {
  const entry = resolve(process.argv[alienPathIndex + 1])
  const alien = await import(pathToFileURL(entry).href)
  const adapter = {
    signal(initial) {
      const value = alien.signal(initial)
      return [() => value(), next => value(next)]
    },
    memo: alien.computed,
    effect: alien.effect,
  }
  measurements.alien = {
    writeOneEffect: measure(adapter, false),
    diamond: measure(adapter, true),
  }
  const visited = new Set()
  function collectLocalModules(file) {
    if (visited.has(file)) return
    visited.add(file)
    for (const dependency of imports(readFileSync(file, 'utf8'))) {
      if (dependency.startsWith('.'))
        collectLocalModules(resolve(dirname(file), dependency))
    }
  }
  collectLocalModules(entry)
  comparison = {
    modules: [...visited].map(file => {
      const contents = readFileSync(file)
      return {
        file: relative(dirname(entry), file),
        bytes: contents.length,
        gzipBytes: gzipSync(contents).length,
      }
    }),
  }
}

console.log(
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        nodeEnv: process.env.NODE_ENV ?? 'development',
      },
      method: {
        iterations,
        warmup,
        rounds,
        metric:
          'median elapsed milliseconds; setup/disposal excluded; real synchronous updates asserted',
      },
      package: relative(process.cwd(), packageDir),
      sourceGraph,
      artifactGraph,
      sizes,
      runtimeObjects,
      measurements,
      comparison,
    },
    null,
    2,
  ),
)
