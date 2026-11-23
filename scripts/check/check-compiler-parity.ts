/**
 * Native and WebAssembly compilers must agree (R24 TASK 31).
 *
 * Both hosts run the same Rust compiler, so any difference in what they emit is
 * a defect in one of the two bindings — not a design choice. The failure this
 * check was written for is the nested-hydration fixture: the compiled code and
 * the hydration plan both have to be identical, or a browser running the WASM
 * build would hydrate a tree the native build never produced.
 *
 * ## What "identical" means here
 *
 * The generated **code** is compared byte for byte. The **hydration plan** and
 * **diagnostics** are compared as JSON values with keys sorted, because key
 * order is not part of a JSON value: measured on this fixture, the two hosts
 * produce plans whose keys come out in different orders and whose contents are
 * the same. Comparing serialised strings would report a difference that a
 * consumer cannot observe and that nobody should fix by reordering a struct.
 *
 * The SourceMap is compared the same way, and that decision is recorded rather
 * than left implicit — R22 found the same key-order difference there and it was
 * briefly mistaken for a semantic one.
 *
 * ## The fixture set
 *
 * Each entry is a shape this project has had a defect in or a question about:
 * the nested-hydration tree, a Show with a component branch, adjacent dynamic
 * text, and a For. A parity check over one trivial component would pass while
 * the interesting paths diverged.
 *
 * ```text
 * pnpm check:compiler-parity
 * ```
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/compiler-parity')
const require = createRequire(import.meta.url)

interface TransformResult {
  code: string
  diagnostics: unknown
  hydrationPlan: unknown
  map?: unknown
}
interface Compiler {
  transformModule: (
    options: Record<string, unknown>,
  ) => TransformResult | Promise<TransformResult>
}

const native = require(
  path.join(root, 'packages/compiler/compiler-native'),
) as Compiler

async function loadWasm(): Promise<Compiler> {
  const mod = (await import(
    path.join(root, 'packages/compiler/compiler-wasm/index.js')
  )) as { loadCompiler: (bytes: Uint8Array) => Promise<Compiler> }
  return mod.loadCompiler(
    fs.readFileSync(
      path.join(root, 'packages/compiler/compiler-wasm/zeus-compiler.wasm'),
    ),
  )
}

/**
 * A JSON value with object keys sorted, recursively.
 *
 * Keys are not ordered in JSON, so two hosts that marshal the same struct in a
 * different field order produce the same value. Comparing the serialised form
 * would call that a difference.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return value
}

interface Fixture {
  readonly name: string
  readonly purpose: string
  readonly source: string
  readonly target: 'dom' | 'ssr'
}

const FIXTURES: readonly Fixture[] = [
  {
    name: 'nested-hydration',
    purpose: 'the tree the nested-binding investigation used',
    target: 'dom',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
const signals = (() => {
  const [label, setLabel] = createSignal('child label')
  const [open, setOpen] = createSignal(true)
  return { label, setLabel, open, setOpen }
})()
function Grandchild(props) {
  return <em id="grandchild">{props.text}</em>
}
function Child(props) {
  return (
    <div id="child">
      <span id="child-label">{props.label()}</span>
      <Show when={props.open()}><Grandchild text="deep" /></Show>
    </div>
  )
}
export function App() {
  return (
    <section id="root">
      <h1 id="title">parent</h1>
      <Child label={signals.label} open={signals.open} />
      <aside id="sibling-a">a</aside>
    </section>
  )
}`,
  },
  {
    name: 'show-with-component',
    purpose: 'a component in a Show branch',
    target: 'dom',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
function Leaf(props) { return <em id="leaf">{props.text}</em> }
export function App() {
  const [open] = createSignal(true)
  return <div id="r"><Show when={open()}><Leaf text="a" /></Show></div>
}`,
  },
  {
    name: 'adjacent-text',
    purpose: 'two dynamic texts around a Show',
    target: 'dom',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
export function App() {
  const [a] = createSignal(0)
  const [b] = createSignal(1)
  const [open] = createSignal(true)
  return <div id="r"><span>{a()}</span><Show when={open()}><b>x</b></Show><span>{b()}</span></div>
}`,
  },
  {
    name: 'for-with-index',
    purpose: 'a keyed list with an index accessor',
    target: 'dom',
    source: `import { For, createSignal } from '@zeus-js/zeus'
export function App() {
  const [items] = createSignal([1, 2, 3])
  return <For each={items()}>{(item, index) => <li>{index()}: {item}</li>}</For>
}`,
  },
  {
    name: 'nested-hydration-ssr',
    purpose: 'the same tree compiled for the server',
    target: 'ssr',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
const signals = (() => {
  const [label, setLabel] = createSignal('child label')
  const [open, setOpen] = createSignal(true)
  return { label, setLabel, open, setOpen }
})()
function Grandchild(props) {
  return <em id="grandchild">{props.text}</em>
}
function Child(props) {
  return (
    <div id="child">
      <span id="child-label">{props.label()}</span>
      <Show when={props.open()}><Grandchild text="deep" /></Show>
    </div>
  )
}
export function App() {
  return (
    <section id="root">
      <h1 id="title">parent</h1>
      <Child label={signals.label} open={signals.open} />
    </section>
  )
}`,
  },
]

const wasm = await loadWasm()
fs.mkdirSync(output, { recursive: true })

interface Row {
  readonly fixture: string
  readonly check: string
  readonly status: 'passed' | 'failed'
  readonly detail?: string
}
const rows: Row[] = []

for (const fixture of FIXTURES) {
  const options = {
    source: fixture.source,
    filename: `${fixture.name}.tsx`,
    target: fixture.target,
    runtimeModule:
      fixture.target === 'ssr'
        ? '@zeus-js/runtime-ssr'
        : '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: true,
    hmr: false,
    autoHydrate: true,
  }
  const fromNative = (await native.transformModule(options)) as TransformResult
  const fromWasm = (await wasm.transformModule(options)) as TransformResult

  const record = (check: string, equal: boolean, detail?: string): void => {
    rows.push({
      fixture: fixture.name,
      check,
      status: equal ? 'passed' : 'failed',
      detail,
    })
  }

  record(
    'code',
    fromNative.code === fromWasm.code,
    fromNative.code === fromWasm.code
      ? undefined
      : 'the two hosts emitted different JavaScript',
  )
  // The detail is only carried on failure, so a passing run prints just the
  // checks. Passing the explanation unconditionally made every green row print
  // "the plans differ", which reads as a contradiction.
  const planEqual =
    JSON.stringify(canonical(fromNative.hydrationPlan)) ===
    JSON.stringify(canonical(fromWasm.hydrationPlan))
  record(
    'hydrationPlan',
    planEqual,
    planEqual
      ? undefined
      : 'the hydration plans differ as JSON values, not just in key order',
  )
  const diagnosticsEqual =
    JSON.stringify(canonical(fromNative.diagnostics)) ===
    JSON.stringify(canonical(fromWasm.diagnostics))
  record(
    'diagnostics',
    diagnosticsEqual,
    diagnosticsEqual ? undefined : 'the diagnostics differ as JSON values',
  )
  const mapEqual =
    JSON.stringify(canonical(fromNative.map)) ===
    JSON.stringify(canonical(fromWasm.map))
  record(
    'sourceMap',
    mapEqual,
    mapEqual
      ? undefined
      : 'the source maps differ as JSON values, not just in key order',
  )
}

for (const row of rows) {
  console.log(
    `  ${row.status === 'passed' ? 'ok  ' : 'FAIL'} ${row.fixture}: ${row.check}`,
  )
  if (row.detail) console.log(`       ${row.detail}`)
}

const failures = rows.filter(row => row.status !== 'passed')
const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
fs.writeFileSync(
  path.join(output, 'report.json'),
  `${JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      sourceCommit: sha,
      node: process.version,
      note:
        'Plans, diagnostics and maps are compared as sorted JSON values: key ' +
        'order is not part of a JSON value, and the two hosts marshal the same ' +
        'struct in different field orders.',
      fixtures: FIXTURES.map(entry => ({
        name: entry.name,
        purpose: entry.purpose,
        target: entry.target,
      })),
      rows,
      passed: failures.length === 0,
    },
    null,
    2,
  )}\n`,
)

console.log(
  `\nCompiler parity: ${rows.length - failures.length}/${rows.length} check(s) passed across ${FIXTURES.length} fixture(s)`,
)
assert.equal(
  failures.length,
  0,
  `the two hosts disagree on ${failures.map(row => `${row.fixture}/${row.check}`).join(', ')}`,
)
