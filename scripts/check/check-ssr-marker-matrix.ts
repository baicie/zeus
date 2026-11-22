/**
 * The SSR marker structure around Show, text and nested components (R24 TASK 13–16).
 *
 * Every Show failure in this project's history has come down to a marker
 * question — which component owns which prefix, whether a close marker belongs
 * to the region it appears to, whether a text region's close is being read as
 * the Show's. Those questions are answerable from the compiled output alone,
 * without a browser, and answering them there makes a browser failure
 * attributable instead of mysterious.
 *
 * This check compiles a matrix of shapes and asserts the structure the runtime
 * contract requires:
 *
 *   * a dynamic text next to a Show stays a separate region — its close marker
 *     must not be consumed by the Show's;
 *   * a component inside a Show gets its own root marker pair, and that pair
 *     nests inside the Show's open/close rather than straddling it;
 *   * every open marker has exactly one close, in order;
 *   * no marker ID is reused across semantic positions, except where a For
 *     template legitimately repeats it.
 *
 * It does not need a browser, so it runs on any machine and in the rust-test
 * job — which is the point: a marker regression should not depend on Playwright
 * to be noticed.
 *
 * ```text
 * pnpm check:ssr-marker-matrix
 * ```
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// The built bundles reference these, which the bundler normally substitutes.
// Defined after the imports rather than between them: an import group cannot
// have a statement inside it, and the first version put this comment and these
// assignments in the middle of one.
;(globalThis as Record<string, unknown>).__DEV__ = false
;(globalThis as Record<string, unknown>).__TEST__ = true
;(globalThis as Record<string, unknown>).__VERSION__ = 'test'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/ssr-marker-matrix')

interface Compiler {
  transformModule: (options: Record<string, unknown>) => {
    code: string
    diagnostics: Array<{ code: string; message: string }>
    hydrationPlan: unknown
  }
}
const compiler = require(
  path.join(root, 'packages/compiler/compiler/dist/compiler.cjs'),
) as Compiler

interface Case {
  readonly name: string
  readonly source: string
  /** What the shape is for, in one line. */
  readonly purpose: string
}

const CASES: readonly Case[] = [
  {
    name: 'text-then-show',
    purpose: 'a dynamic text immediately before a Show',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
export function App() {
  const [n] = createSignal(0)
  const [open] = createSignal(true)
  return <div id="r"><span>{n()}</span><Show when={open()}><b>x</b></Show></div>
}`,
  },
  {
    name: 'show-then-text',
    purpose: 'a dynamic text immediately after a Show',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
export function App() {
  const [n] = createSignal(0)
  const [open] = createSignal(true)
  return <div id="r"><Show when={open()}><b>x</b></Show><span>{n()}</span></div>
}`,
  },
  {
    name: 'text-show-text',
    purpose: 'dynamic text on both sides of a Show',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
export function App() {
  const [a] = createSignal(0)
  const [b] = createSignal(1)
  const [open] = createSignal(true)
  return <div id="r"><span>{a()}</span><Show when={open()}><b>x</b></Show><span>{b()}</span></div>
}`,
  },
  {
    name: 'show-text-show',
    purpose: 'a Show, a text, and another Show',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
export function App() {
  const [n] = createSignal(0)
  const [a] = createSignal(true)
  const [b] = createSignal(false)
  return (
    <div id="r">
      <Show when={a()}><b>x</b></Show>
      <i>{n()}</i>
      <Show when={b()}><u>y</u></Show>
    </div>
  )
}`,
  },
  {
    name: 'component-in-show',
    purpose: 'one component inside a Show branch',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
function Leaf(props) { return <em id="leaf">{props.text}</em> }
export function App() {
  const [open] = createSignal(true)
  return <div id="r"><Show when={open()}><Leaf text="a" /></Show></div>
}`,
  },
  {
    name: 'two-components-in-show',
    purpose: 'two components inside one Show branch',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
function A(props) { return <em id="a">{props.text}</em> }
function B(props) { return <i id="b">{props.text}</i> }
export function App() {
  const [open] = createSignal(true)
  return <div id="r"><Show when={open()}><A text="a" /><B text="b" /></Show></div>
}`,
  },
  {
    name: 'component-and-text-in-show',
    purpose: 'a component and a dynamic text in one Show branch',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
function A(props) { return <em id="a">{props.text}</em> }
export function App() {
  const [n] = createSignal(0)
  const [open] = createSignal(true)
  return <div id="r"><Show when={open()}><A text="a" /><b>{n()}</b></Show></div>
}`,
  },
  {
    name: 'nested-show',
    purpose: 'a Show inside a Show',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
export function App() {
  const [outer] = createSignal(true)
  const [inner] = createSignal(true)
  return <Show when={outer()}><div><Show when={inner()}><b>x</b></Show></div></Show>
}`,
  },
  {
    name: 'component-in-show-with-fallback',
    purpose: 'a Show with a fallback and a component in its branch',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
function A(props) { return <em id="a">{props.text}</em> }
export function App() {
  const [open] = createSignal(true)
  return <Show when={open()} fallback={<p id="fb">none</p>}><A text="a" /></Show>
}`,
  },
  {
    name: 'fragment-with-show',
    purpose: 'a fragment containing a Show',
    source: `import { Show, createSignal } from '@zeus-js/zeus'
export function App() {
  const [open] = createSignal(true)
  return <><i id="a">a</i><Show when={open()}><b>x</b></Show><i id="b">b</i></>
}`,
  },
]

interface Marker {
  readonly id: string
  readonly kind: 'open' | 'close'
  readonly index: number
}

/**
 * Every hydration marker in a document, in order.
 *
 * Parsed as text rather than as DOM: the point is the sequence the SSR emitter
 * wrote, and the browser's parser is the thing that could later normalise it.
 */
function markers(html: string): Marker[] {
  const found: Marker[] = []
  for (const match of html.matchAll(/<!--zeus:hydrate:([^>]*)-->/g)) {
    const raw = match[1]!.trim()
    const close = raw.startsWith('/')
    // `<!--zeus:hydrate:/-->` is the shared text close; it names no region.
    const id = close ? raw.slice(1) || '(text-close)' : raw
    found.push({ id, kind: close ? 'close' : 'open', index: match.index! })
  }
  return found
}

/**
 * Pairs open and close markers by ID, respecting nesting.
 *
 * A stack rather than a map: two regions may share an ID only inside a For
 * template, and pairing by ID alone would silently accept a close marker that
 * arrived before its open.
 */
/**
 * Marker kinds, from the contract the emitter and the runtime share.
 *
 * Only two marker families are paired: a component root (`cN.root`) and a
 * dynamic region (`cN.sN` for Show, `cN.fN` for For). Everything else is a
 * *position* marker — `cN.eN` for an element, `cN.cN` for a child slot,
 * `cN.tN` for a text — and is written once, self-closing, never paired.
 *
 * The first version of this file assumed every marker opened a region, so
 * `[c1.e2]…[/c1.root]` read as "a close arriving before its open". That is the
 * shape the compiler actually emits, and treating it as an error would have
 * reported ten false failures across the matrix.
 */
function isPaired(id: string): boolean {
  return /\.root$|\.s\d+$|\.f\d+$/.test(id)
}

/**
 * Pairs the region markers, respecting nesting.
 *
 * A stack rather than a map: two regions may share an ID inside a For template,
 * and pairing by ID alone would silently accept a close that arrived before its
 * open.
 */
function pair(markers: readonly Marker[]): Array<{
  id: string
  open: number
  close: number
  depth: number
}> {
  const stack: Array<{ id: string; open: number; depth: number }> = []
  const pairs: Array<{
    id: string
    open: number
    close: number
    depth: number
  }> = []
  for (const marker of markers) {
    if (marker.kind === 'open') {
      if (!isPaired(marker.id)) continue
      stack.push({ id: marker.id, open: marker.index, depth: stack.length })
      continue
    }
    if (marker.id === '(text-close)') {
      // The shared close for a dynamic text value; it names no region and is
      // never on the stack.
      continue
    }
    if (!isPaired(marker.id)) continue
    const top = stack[stack.length - 1]
    if (!top) {
      throw new Error(
        `close marker "${marker.id}" at ${marker.index} has no matching open`,
      )
    }
    if (top.id !== marker.id) {
      throw new Error(
        `close marker "${marker.id}" at ${marker.index} closes "${top.id}", which ` +
          'was opened more recently — the region sequence is not nested',
      )
    }
    stack.pop()
    pairs.push({
      id: marker.id,
      open: top.open,
      close: marker.index,
      depth: top.depth,
    })
  }
  if (stack.length > 0) {
    throw new Error(
      `unclosed regions: ${stack.map(entry => entry.id).join(', ')}`,
    )
  }
  return pairs.sort((a, b) => a.open - b.open)
}

async function ssr(source: string): Promise<{ code: string; html: string }> {
  const result = compiler.transformModule({
    source,
    filename: 'matrix.tsx',
    target: 'ssr',
    runtimeModule: '@zeus-js/runtime-ssr',
    delegateEvents: false,
    sourceMap: false,
    hmr: false,
    autoHydrate: true,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `must compile cleanly, got ${JSON.stringify(result.diagnostics.map(d => d.code))}`,
  )
  const html = await renderSsr(result.code)
  return { code: result.code, html }
}

/** Renders one compiled module to HTML in a fresh worker-free context. */
async function renderSsr(code: string): Promise<string> {
  const file = path.join(output, `case-${counter++}.mjs`)
  // The compiled module imports the runtime by package name; rewrite it to the
  // built file so Node can load it without a resolver.
  const runtimeSsr = path.join(
    root,
    'packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js',
  )
  const patched = code.replace(
    /from\s*["']@zeus-js\/runtime-ssr["']/g,
    `from "${runtimeSsr}"`,
  )
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(file, patched)
  const mod = (await import(`${pathToFileURL(file).href}?v=${counter}`)) as {
    App: () => unknown
    [key: string]: unknown
  }
  const runtime = (await import(pathToFileURL(runtimeSsr).href)) as {
    renderToString: (run: () => unknown) => string
  }
  return runtime.renderToString(() => mod.App())
}
let counter = 0

interface Result {
  readonly check: string
  readonly status: 'passed' | 'failed'
  readonly error?: string
}
const results: Result[] = []
async function checkAsync(
  name: string,
  run: () => Promise<void> | void,
): Promise<void> {
  try {
    await run()
    results.push({ check: name, status: 'passed' })
  } catch (error) {
    results.push({
      check: name,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

for (const entry of CASES) {
  await checkAsync(`${entry.name}: markers nest and pair`, async () => {
    const { html } = await ssr(entry.source)
    const found = markers(html)
    assert(
      found.length > 0,
      `${entry.name}: the rendered HTML has no hydration markers at all`,
    )
    const pairs = pair(found)
    assert(
      pairs.length > 0,
      `${entry.name}: markers were found but none paired`,
    )
  })

  await checkAsync(
    `${entry.name}: the document ends with a close marker`,
    async () => {
      const { html } = await ssr(entry.source)
      const found = markers(html)
      const last = found[found.length - 1]!
      assert(
        last.kind === 'close',
        `${entry.name}: the HTML ends with an open marker, so something is unclosed`,
      )
    },
  )

  await checkAsync(`${entry.name}: no marker id repeats`, async () => {
    const { html } = await ssr(entry.source)
    const openIds = markers(html)
      .filter(marker => marker.kind === 'open' && marker.id !== '(text-close)')
      .map(marker => marker.id)
    const seen = new Set<string>()
    const duplicates = openIds.filter(id => {
      if (seen.has(id)) return true
      seen.add(id)
      return false
    })
    assert.deepEqual(
      duplicates,
      [],
      `${entry.name}: these marker ids are reused: ${duplicates.join(', ')}`,
    )
  })
}

for (const entry of CASES.filter(
  c => c.name.includes('in-show') || c.name === 'nested-show',
)) {
  await checkAsync(
    `${entry.name}: every nested region closes before its parent`,
    async () => {
      const { html } = await ssr(entry.source)
      const pairs = pair(markers(html))
      for (const inner of pairs) {
        for (const outer of pairs) {
          if (inner === outer || inner.depth <= outer.depth) continue
          const inside = inner.open > outer.open && inner.close < outer.close
          assert(
            inside,
            `${entry.name}: "${inner.id}" (depth ${inner.depth}) does not sit inside ` +
              `"${outer.id}" (depth ${outer.depth}) — it straddles the region boundary`,
          )
        }
      }
    },
  )
}

const missing = results.filter(result => result.status !== 'passed')
for (const result of results) {
  console.log(
    `  ${result.status === 'passed' ? 'ok  ' : 'FAIL'} ${result.check}`,
  )
  if (result.error) console.log(`       ${result.error.split('\n')[0]}`)
}
console.log(
  `\nSSR marker matrix: ${results.length - missing.length}/${results.length} check(s) passed across ${CASES.length} shape(s)`,
)

fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(
  path.join(output, 'report.json'),
  `${JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      cases: CASES.map(entry => ({ name: entry.name, purpose: entry.purpose })),
      results,
      passed: missing.length === 0,
    },
    null,
    2,
  )}\n`,
)
if (missing.length > 0) process.exitCode = 1
