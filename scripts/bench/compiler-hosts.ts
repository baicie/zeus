/**
 * Native and WebAssembly compilers, measured on the same input (R22 TASK 55).
 *
 * `bench:compiler-native` times the native binding alone. Nothing compared the
 * two hosts, so the question "what does a browser user pay for compiling in
 * WASM instead of Node" had no number. This is that number, collected the same
 * ways for both so the difference is the host and not the harness.
 *
 * ## What is measured, and what it does not mean
 *
 * Three figures per host:
 *
 *   * `loadMs` — time before the first transform can run: `require` for native,
 *     `WebAssembly.instantiate` for WASM. WASM pays an instantiation cost native
 *     does not.
 *   * `coldCompileMs` — the first transform, which includes any lazy setup the
 *     host does on first call.
 *   * `warmCompileMs` — the median of `--iterations` transforms after one
 *     warmup, so a single slow run cannot move it the way a mean would.
 *
 * **This is not a performance gate.** There is no threshold and no failure on
 * being slow: the numbers depend on the machine, and a hard limit chosen on one
 * machine is a flaky test elsewhere. It fails only if a host cannot compile the
 * fixture at all, or produces different output from the other — a correctness
 * difference, which is worth failing on.
 *
 * ## When the measurement is reported as inconclusive
 *
 * Measured on a laptop, the per-sample spread reached 289% for native and
 * 3922% for WASM, and the WASM/native ratio came out 1.164, 0.612 and 0.455 on
 * three consecutive runs of the same binary. A ratio that swings by 2.5x
 * between runs is not a measurement of the hosts; it is a measurement of what
 * else the machine was doing.
 *
 * So the report says so. It computes the median absolute deviation relative to
 * the median for each host — a dispersion figure a single slow sample cannot
 * inflate the way a range can — and when that exceeds `--max-dispersion`
 * (default 20%) it prints INCONCLUSIVE and omits the ratio rather than
 * publishing a number the data cannot support.
 *
 * ## Usage
 *
 * ```text
 * pnpm bench:compiler-hosts
 * pnpm bench:compiler-hosts --iterations 200
 * ```
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const root = path.resolve(import.meta.dirname, '../..')
const require = createRequire(import.meta.url)
const output = path.join(root, 'temp/bench/compiler-hosts.json')

const iterations = readIterations()
const maxDispersion = readMaxDispersion()

/**
 * A fixture with the shapes the compiler spends time on: a component, a signal
 * read, a delegated event, and two control-flow builtins. One-trivial-element
 * fixtures measure the call overhead and nothing else.
 */
const SOURCE = `import { createSignal } from '@zeus-js/signal'
import { For, Show } from '@zeus-js/zeus'

const [count, setCount] = createSignal(0)
const items = [1, 2, 3]

export function App() {
  return (
    <section class="panel">
      <button onClick={() => setCount(count() + 1)}>count: {count()}</button>
      <Show when={count() > 0} fallback={<p>empty</p>}>
        <For each={items}>{item => <li title={String(item)}>{item}</li>}</For>
      </Show>
    </section>
  )
}
`

const OPTIONS = {
  source: SOURCE,
  filename: 'bench.tsx',
  target: 'dom' as const,
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: true,
  hmr: false,
}

interface HostResult {
  host: 'native' | 'wasm'
  loadMs: number
  coldCompileMs: number
  /** Median of the warm runs. */
  warmCompileMs: number
  warmMinMs: number
  warmMaxMs: number
  /**
   * Median absolute deviation over the median, as a fraction.
   *
   * Chosen over the range because one descheduled sample moves a range by
   * hundreds of percent while barely moving the median.
   */
  dispersion: number
  /** False when `dispersion` says the samples cannot support a comparison. */
  conclusive: boolean
  generatedBytes: number
  /** The emitted code, kept so the two hosts can be compared byte for byte. */
  code?: string
  compiled: boolean
  error?: string
}

interface Compiler {
  transformModule: (options: typeof OPTIONS) =>
    | Promise<{
        code: string
        diagnostics: unknown[]
      }>
    | { code: string; diagnostics: unknown[] }
}

async function measureNative(): Promise<HostResult> {
  const start = performance.now()
  const native = require(
    path.join(root, 'packages/compiler/compiler-native'),
  ) as Compiler
  const loadMs = performance.now() - start
  return measure('native', native, loadMs)
}

async function measureWasm(): Promise<HostResult> {
  const start = performance.now()
  const { loadCompiler } = (await import(
    path.join(root, 'packages/compiler/compiler-wasm/index.js')
  )) as { loadCompiler: (source: Uint8Array) => Promise<Compiler> }
  const bytes = fs.readFileSync(
    path.join(root, 'packages/compiler/compiler-wasm/zeus-compiler.wasm'),
  )
  const wasm = await loadCompiler(bytes)
  const loadMs = performance.now() - start
  return measure('wasm', wasm, loadMs)
}

async function measure(
  host: 'native' | 'wasm',
  compiler: Compiler,
  loadMs: number,
): Promise<HostResult> {
  const coldStart = performance.now()
  const first = await compiler.transformModule(OPTIONS)
  const coldCompileMs = performance.now() - coldStart
  if (first.diagnostics.length > 0) {
    throw new Error(
      `${host}: the benchmark fixture failed to compile: ${JSON.stringify(first.diagnostics)}`,
    )
  }

  // One warmup outside the samples: the second call is where a host's lazy
  // caches are already warm, and including it would flatter whichever host has
  // more of them.
  await compiler.transformModule(OPTIONS)

  const samples: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now()
    await compiler.transformModule(OPTIONS)
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)

  return {
    host,
    loadMs: round(loadMs),
    coldCompileMs: round(coldCompileMs),
    warmCompileMs: round(median(samples)),
    warmMinMs: round(samples[0] ?? 0),
    warmMaxMs: round(samples[samples.length - 1] ?? 0),
    dispersion: round(relativeMad(samples)),
    conclusive: false,
    generatedBytes: Buffer.byteLength(first.code),
    code: first.code,
    compiled: true,
  }
}

const results: HostResult[] = []
const failures: string[] = []

for (const [host, run] of [
  ['native', measureNative],
  ['wasm', measureWasm],
] as const) {
  try {
    results.push(await run())
  } catch (error) {
    failures.push(
      `${host}: ${error instanceof Error ? error.message : String(error)}`,
    )
    results.push({
      host,
      loadMs: 0,
      coldCompileMs: 0,
      warmCompileMs: 0,
      warmMinMs: 0,
      warmMaxMs: 0,
      dispersion: 0,
      conclusive: false,
      generatedBytes: 0,
      compiled: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// The two hosts run the same Rust compiler, so the code they emit must be
// identical. This is the part worth failing on: a difference means the hosts
// have diverged, which is a correctness defect rather than a speed one.
//
// Compared as strings, not as lengths. The first version compared
// `generatedBytes` and passed on a fixture whose maps differed in key order —
// equal lengths say nothing about equal content.
const native = results.find(result => result.host === 'native')
const wasm = results.find(result => result.host === 'wasm')
if (native?.compiled && wasm?.compiled) {
  if (native.code !== wasm.code) {
    const at = firstDifference(native.code ?? '', wasm.code ?? '')
    failures.push(
      `the two hosts emitted different code (first difference at byte ${at}):\n` +
        `    native: ${JSON.stringify((native.code ?? '').slice(Math.max(0, at - 40), at + 40))}\n` +
        `    wasm:   ${JSON.stringify((wasm.code ?? '').slice(Math.max(0, at - 40), at + 40))}`,
    )
  }
}

// A comparison needs both hosts to have run AND both to be stable enough to
// compare. Marking each result individually keeps the raw timings in the
// report — they are still the honest record of what was observed — while the
// conclusion is withheld.
for (const result of results) {
  result.conclusive = result.compiled && result.dispersion <= maxDispersion
}
const comparable = results.every(result => result.conclusive)
const ratio =
  comparable && native && wasm && native.warmCompileMs > 0
    ? round(wasm.warmCompileMs / native.warmCompileMs)
    : null

const report = {
  measuredAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  iterations,
  fixture: 'component + signal + delegated event + Show + For',
  note: 'No threshold: this describes the two hosts, it does not gate them. A shared Rust compiler must produce identical output, and that IS asserted.',
  results,
  maxDispersion,
  verdict: comparable
    ? 'MEASURED'
    : 'INCONCLUSIVE: sample dispersion exceeds the threshold, so the ratio is ' +
      'omitted. Re-run on a quiet machine, or raise --iterations.',
  wasmToNativeWarmRatio: ratio,
  failures,
}

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (!comparable) {
  // Reported, not failed: an unstable machine is not a defect in the compiler,
  // and turning it into a red build would teach people to ignore this check.
  console.log(
    `\nINCONCLUSIVE: at least one host's dispersion (${results
      .map(result => `${result.host} ${(result.dispersion * 100).toFixed(1)}%`)
      .join(
        ', ',
      )}) exceeds ${(maxDispersion * 100).toFixed(0)}% of its median. ` +
      'The ratio is omitted rather than published.',
  )
}

if (failures.length > 0) {
  console.error(`\ncompiler host benchmark FAILED:\n  ${failures.join('\n  ')}`)
  process.exitCode = 1
}

/** Index of the first byte where two strings differ, or the shorter length. */
function firstDifference(a: string, b: string): number {
  const limit = Math.min(a.length, b.length)
  for (let index = 0; index < limit; index += 1) {
    if (a[index] !== b[index]) return index
  }
  return limit
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Ratio of the median absolute deviation to the median. */
function relativeMad(sorted: number[]): number {
  const centre = median(sorted)
  if (centre <= 0) return 0
  const deviations = sorted
    .map(value => Math.abs(value - centre))
    .sort((a, b) => a - b)
  return median(deviations) / centre
}

function readMaxDispersion(): number {
  const index = process.argv.indexOf('--max-dispersion')
  if (index === -1) return 0.2
  const value = Number(process.argv[index + 1])
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('--max-dispersion must be a non-negative number')
  }
  return value
}

function readIterations(): number {
  const index = process.argv.indexOf('--iterations')
  if (index === -1) return 50
  const value = Number(process.argv[index + 1])
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--iterations must be a positive integer')
  }
  return value
}
