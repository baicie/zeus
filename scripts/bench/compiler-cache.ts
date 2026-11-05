import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { createCompilerCache } from '../../packages/devtools/vite-plugin/src/cache'

const root = path.resolve(import.meta.dirname, '../..')
const moduleCount = 5_000
const warmCalls = 10_000
const sampleCount = 7

const input = (filename: string, source: string) => ({
  compilerVersion: 'benchmark',
  filename,
  source,
  target: 'dom' as const,
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: true,
  hmr: false,
})

const source = `export const App = props => <button>{props.label}</button>\n`
const value = createResult(source, '/src/App.tsx')
const events: string[] = []
const cache = createCompilerCache({
  onEvent: event => events.push(event.type),
})

const coldSamples: number[] = []
const warmSamples: number[] = []
const changedSamples: number[] = []
for (let sample = 0; sample < sampleCount; sample++) {
  const filename = `/src/cold-${sample}.tsx`
  const sampleInput = input(filename, source)
  const changedInput = input(
    filename,
    source.replace('label', `changed-${sample}`),
  )

  const coldStart = performance.now()
  if (cache.get(sampleInput) !== undefined) throw new Error('cold lookup hit')
  cache.set(sampleInput, value)
  coldSamples.push(performance.now() - coldStart)

  const warmStart = performance.now()
  for (let index = 0; index < warmCalls; index++) {
    if (cache.get(sampleInput) !== value) throw new Error('warm lookup missed')
  }
  warmSamples.push((performance.now() - warmStart) / warmCalls)

  const changedStart = performance.now()
  if (cache.get(changedInput) !== undefined) {
    throw new Error('changed lookup hit')
  }
  cache.set(changedInput, value)
  changedSamples.push(performance.now() - changedStart)
}

const coldLookupAndSetMs = median(coldSamples)
const warmLookupMsPerCall = median(warmSamples)
const changedLookupAndSetMs = median(changedSamples)

const beforeFill = heapUsedAfterGc()
for (let index = 0; index < moduleCount; index++) {
  const filename = `/src/module-${index}.tsx`
  // Each entry keeps its own transform result. Sharing one value would only
  // measure the Map bookkeeping and understate what a warm cache really holds.
  cache.set(input(filename, source), createResult(source, filename))
}
const afterFill = heapUsedAfterGc()
const snapshot = cache.snapshot()
if (snapshot.entries !== moduleCount + sampleCount) {
  throw new Error(
    `expected ${moduleCount + sampleCount} cache entries, got ${snapshot.entries}`,
  )
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  moduleCount,
  warmCalls,
  sampleCount,
  coldLookupAndSetMs: round(coldLookupAndSetMs),
  warmLookupMsPerCall: round(warmLookupMsPerCall),
  changedLookupAndSetMs: round(changedLookupAndSetMs),
  distribution: {
    coldLookupAndSetMs: summarize(coldSamples),
    warmLookupMsPerCall: summarize(warmSamples),
    changedLookupAndSetMs: summarize(changedSamples),
  },
  entries: snapshot.entries,
  heapDeltaBytes: afterFill - beforeFill,
  heapBytesPerEntry: round((afterFill - beforeFill) / moduleCount),
  syntheticResultBytes: resultByteLength(source, '/src/module-0.tsx'),
  cacheCounters: snapshot,
  eventCounts: countEvents(events),
  note: 'Synthetic cache-only measurement; no performance threshold is inferred from these observations.',
}

const output = path.join(root, 'temp/bench/compiler-cache.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))

function heapUsedAfterGc(): number {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc
  gc?.()
  return process.memoryUsage().heapUsed
}

/**
 * A stand-in for one compiler result: generated code plus a decoded Source Map
 * v3 whose `sourcesContent` holds the module. The shape and sizes follow a real
 * `transformModule` result so cache memory is measured against something
 * comparable to production entries.
 */
function createResult(source: string, filename: string) {
  const code = `${source}${'/* generated */\n'.repeat(6)}`
  return {
    code,
    map: {
      version: 3 as const,
      file: filename,
      sources: [path.basename(filename)],
      sourcesContent: [source],
      names: ['App', 'props', 'label'],
      mappings: ';;AAAA,MAAM,GAAG,CAAC,MAAM,GAAG',
    },
    diagnostics: [],
  }
}

function resultByteLength(source: string, filename: string): number {
  return Buffer.byteLength(JSON.stringify(createResult(source, filename)))
}

function countEvents(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, event) => {
    counts[event] = (counts[event] ?? 0) + 1
    return counts
  }, {})
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]!
}

function summarize(values: readonly number[]): {
  min: number
  median: number
  max: number
} {
  return {
    min: round(Math.min(...values)),
    median: round(median(values)),
    max: round(Math.max(...values)),
  }
}
