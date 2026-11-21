/**
 * DOM precise-update E2E (TASK F / R20).
 *
 * The framework's central claim is that updating one binding touches one DOM
 * node and leaves every other node alone. Until now nothing verified that in a
 * browser: the existing browser checks cover cleanup counts and a11y, and the
 * CI jobs named "browser" run page smoke tests. A page that re-created its
 * whole subtree on every signal write would pass all of them.
 *
 * This check compiles real TSX with the real compiler, loads the real runtime,
 * and then holds **references** to nodes before an update and compares identity
 * afterwards. Identity is the assertion a re-render cannot satisfy:
 *
 * ```js
 * const before = document.querySelector('h1')
 * setCount(1)
 * before === document.querySelector('h1')   // must be true
 * ```
 *
 * A framework that rebuilds the subtree produces an equal-looking but different
 * node, and the comparison fails while every textual assertion still passes.
 *
 * ## Shape
 *
 * Each fixture is compiled to a **complete ES module** and served as its own
 * `<script type="module">`. The compiler emits `import`/`export` at top level,
 * so wrapping its output in a function body is not an option — that is the
 * first thing this file got wrong.
 *
 * An import map points `@zeus-js/runtime-dom` at the browser build, so the page
 * runs the real runtime without a bundler.
 *
 * ## What this does not prove
 *
 * It does not prove the update is minimal in *work* — only that untouched nodes
 * keep their identity. A framework could still re-evaluate every expression on
 * every update and write the same values back; that would pass here.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:dom-update-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:dom-update-browser   # installed Chrome
 * ```
 *
 * When no browser can be started the script exits 2 with a `BLOCKED` marker —
 * never 0.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'

import {
  type EngineCheckResult,
  reportAcrossEngines,
  runAcrossEngines,
} from './browser-engines'

import type { Page } from '@playwright/test'

declare global {
  interface Window {
    __ready: boolean
    __fixtures: Record<string, () => void>
    __loaded: Record<string, boolean>
    __handle: Record<string, (value: unknown) => void>
    __before: Record<string, Element | null>
    __byId: Record<string, Element>
    __beforeRemoval: Record<string, Element>
    __beforeReplace: Element[]
    __sameKey: Element | null
  }
}

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/dom-update-browser')

interface CompilerOutput {
  code: string
  diagnostics: Array<{ code: string; message: string }>
}

/** Compiles one fixture module, asserting the compiler accepted it. */
function compile(name: string, source: string): string {
  const compiler = require(
    path.join(root, 'packages/compiler/compiler/dist/compiler.cjs'),
  ) as { transformModule: (options: Record<string, unknown>) => CompilerOutput }
  const result = compiler.transformModule({
    source,
    filename: `${name}.tsx`,
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: true,
    sourceMap: false,
    hmr: false,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `${name}: the fixture must compile cleanly, got ${JSON.stringify(result.diagnostics)}`,
  )
  assert.ok(result.code.length > 0, `${name}: the fixture must emit code`)
  return result.code
}

// ---- Fixtures ---------------------------------------------------------------
//
// Each is a complete module. The last lines mount it and publish a handle so
// Playwright can drive signals from outside the page.

const FIXTURES = {
  /**
   * Every binding kind in one component, so one update can be checked against
   * nodes bound to something else. Each bound node has an id; the static ones
   * (`heading`, `footer`) are the controls that must never move.
   */
  bindings: `
import { createSignal, render } from '@zeus-js/zeus'

const [label, setLabel] = createSignal('one')
const [title, setTitle] = createSignal('t0')
const [cls, setCls] = createSignal('a')
const [colour, setColour] = createSignal('red')

function App() {
  return (
    <section id="root" class="shell">
      <h1 id="heading">static heading</h1>
      <p id="text">{label()}</p>
      <div id="attr" title={title()}>attr host</div>
      <div id="styled" class={cls()} style={{ color: colour() }}>styled</div>
      <footer id="footer">static footer</footer>
    </section>
  )
}

render(App, document.getElementById('app'))
window.__handle = { setLabel, setTitle, setCls, setColour }
`,

  /**
   * Show toggling. The branch's nodes are created and destroyed, so their
   * identity legitimately changes — the assertion is on the nodes *around*
   * them, which must not.
   */
  show: `
import { Show, createSignal, render } from '@zeus-js/zeus'

const [open, setOpen] = createSignal(true)

function App() {
  return (
    <div id="host">
      <header id="before">before</header>
      <Show when={open()} fallback={<p id="closed">closed</p>}>
        <p id="open">open</p>
      </Show>
      <footer id="after">after</footer>
    </div>
  )
}

render(App, document.getElementById('app'))
window.__handle = { setOpen }
`,

  /**
   * Keyed For: items keyed by identity keep their nodes across a reorder, which
   * is the whole point of `by`.
   */
  for: `
import { For, createSignal, render } from '@zeus-js/zeus'

const [items, setItems] = createSignal([
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
])

function App() {
  return (
    <ul id="list">
      <For each={items()} by={item => item.id}>
        {item => <li data-id={item.id}>{item.label}</li>}
      </For>
    </ul>
  )
}

render(App, document.getElementById('app'))
window.__handle = { setItems }
`,
} satisfies Record<string, string>

// ---- Page -------------------------------------------------------------------

const fixtureModules = Object.entries(FIXTURES)
  .map(
    ([name, source]) => `
  window.__fixtures[${JSON.stringify(name)}] = () => {
    import('/fixtures/${name}.js').then(() => { window.__loaded[${JSON.stringify(name)}] = true })
  };`,
  )
  .join('')

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>dom-update</title>
<script type="importmap">
{ "imports": {
    "@zeus-js/zeus": "/zeus.js",
    "@zeus-js/runtime-dom": "/runtime-dom.js",
    "@zeus-js/signal": "/signal.js",
    "@zeus-js/signal/internal": "/signal-internal.js",
    "@zeus-js/shared": "/shared.js"
} }
</script>
</head>
<body>
<div id="app"></div>
<script type="module">
  window.__fixtures = {};
  window.__loaded = {};
${fixtureModules}
  window.__ready = true;
</script>
</body>
</html>`

// ---- Server -----------------------------------------------------------------

// The `esm-bundler` builds, wired together the way a bundler would wire them.
//
// The `esm-browser` builds are self-contained: each bundles its own copy of
// the signal engine, so serving both gives the page two engines and the runtime
// refuses to work across them —
//
//   "Cannot create an effect with a different Zeus signal engine."
//
// The `esm-bundler` builds instead import `@zeus-js/signal` as an external, and
// the import map below resolves every specifier to a single copy. This is not a
// workaround for the test: it is how these packages are meant to be consumed by
// anything that resolves modules, and a browser with an import map is such a
// consumer.
const read = (relative: string) =>
  fs.readFile(path.join(root, relative), 'utf8')
const modules: Record<string, string> = {
  '/zeus.js': await read('packages/core/zeus/dist/zeus.esm-bundler.js'),
  '/runtime-dom.js': await read(
    'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
  ),
  '/signal.js': await read('packages/core/signal/dist/signal.esm-bundler.js'),
  // `runtime-dom` imports this subpath directly; it is the engine's internal
  // surface, shipped as its own module.
  '/signal-internal.js': await read('packages/core/signal/dist/internal.js'),
  '/shared.js': await read('packages/core/shared/dist/shared.esm-bundler.js'),
}
const compiled = Object.fromEntries(
  Object.entries(FIXTURES).map(([name, source]) => [
    name,
    compile(name, source),
  ]),
)

const server = http.createServer((request, response) => {
  const url = request.url ?? '/'
  const module = modules[url]
  if (module !== undefined) {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(module)
    return
  }
  const fixture = /^\/fixtures\/([\w-]+)\.js$/.exec(url)
  if (fixture && fixture[1] in compiled) {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(compiled[fixture[1]])
    return
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8')
  response.end(page)
})

await fs.mkdir(output, { recursive: true })
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`

// ---- Helpers ----------------------------------------------------------------

/** Loads the page and one fixture module, then waits for it to render. */
async function load(tab: Page, fixture: keyof typeof FIXTURES): Promise<void> {
  await tab.goto(origin)
  await tab.waitForFunction(() => window.__ready === true)
  await tab.evaluate(name => window.__fixtures[name](), fixture)
  await tab.waitForFunction(
    name => window.__loaded[name] === true,
    fixture as string,
  )
  await tab.waitForFunction(
    () => (document.getElementById('app')?.children.length ?? 0) > 0,
  )
}

/** Captures the current nodes by id so identity can be compared after. */
async function remember(tab: Page, ids: readonly string[]): Promise<void> {
  await tab.evaluate(
    list => {
      window.__before = Object.fromEntries(
        list.map(id => [id, document.getElementById(id)]),
      )
    },
    [...ids],
  )
}

/** The ids whose current node is the same object as when `remember` ran. */
async function survived(tab: Page, ids: readonly string[]): Promise<string[]> {
  return tab.evaluate(
    list =>
      list.filter(id => window.__before[id] === document.getElementById(id)),
    [...ids],
  )
}

// ---- Checks -----------------------------------------------------------------

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: 'a text update leaves every other node the same object',
    async run(tab) {
      await load(tab, 'bindings')
      await remember(tab, [
        'root',
        'heading',
        'text',
        'attr',
        'styled',
        'footer',
      ])

      await tab.evaluate(() => window.__handle.setLabel('two'))
      await tab.waitForFunction(
        () => document.getElementById('text')?.textContent === 'two',
      )

      assert.deepEqual(
        await survived(tab, ['root', 'heading', 'attr', 'styled', 'footer']),
        ['root', 'heading', 'attr', 'styled', 'footer'],
        'a text update must not replace nodes bound to something else',
      )
      assert.deepEqual(
        await survived(tab, ['text']),
        ['text'],
        'the text host element must survive its own update',
      )
    },
  },
  {
    name: 'an attribute update touches only its own element',
    async run(tab) {
      await load(tab, 'bindings')
      await remember(tab, [
        'root',
        'heading',
        'text',
        'attr',
        'styled',
        'footer',
      ])

      await tab.evaluate(() => window.__handle.setTitle('t1'))
      await tab.waitForFunction(
        () => document.getElementById('attr')?.getAttribute('title') === 't1',
      )

      assert.deepEqual(
        await survived(tab, ['root', 'heading', 'text', 'styled', 'footer']),
        ['root', 'heading', 'text', 'styled', 'footer'],
        'an attribute update must not replace other nodes',
      )
      assert.deepEqual(
        await survived(tab, ['attr']),
        ['attr'],
        'the bound element must survive its own attribute update',
      )
    },
  },
  {
    name: 'class and style updates keep the element and its siblings',
    async run(tab) {
      await load(tab, 'bindings')
      await remember(tab, [
        'root',
        'heading',
        'text',
        'attr',
        'styled',
        'footer',
      ])

      await tab.evaluate(() => {
        window.__handle.setCls('b')
        window.__handle.setColour('blue')
      })
      await tab.waitForFunction(
        () => document.getElementById('styled')?.className === 'b',
      )

      const state = await tab.evaluate(() => {
        const element = document.getElementById('styled') as HTMLElement | null
        return {
          same: window.__before.styled === element,
          colour: element?.style.color ?? '',
        }
      })
      assert.ok(
        state.same,
        'the styled element must survive its own class update',
      )
      assert.equal(
        state.colour,
        'blue',
        'the style binding must reach the element',
      )
      assert.deepEqual(
        await survived(tab, ['root', 'heading', 'text', 'attr', 'footer']),
        ['root', 'heading', 'text', 'attr', 'footer'],
      )
    },
  },
  {
    name: 'Show replaces only its own branch',
    async run(tab) {
      await load(tab, 'show')
      assert.deepEqual(
        await tab.evaluate(() => ({
          before: document.getElementById('before') !== null,
          open: document.getElementById('open') !== null,
          after: document.getElementById('after') !== null,
        })),
        { before: true, open: true, after: true },
      )

      await remember(tab, ['before', 'after', 'open'])

      await tab.evaluate(() => window.__handle.setOpen(false))
      await tab.waitForFunction(
        () => document.getElementById('closed') !== null,
      )

      const hidden = await tab.evaluate(() => ({
        around: [
          window.__before.before === document.getElementById('before'),
          window.__before.after === document.getElementById('after'),
        ],
        openReplaced: window.__before.open !== document.getElementById('open'),
        closed: document.getElementById('closed')?.textContent ?? null,
        oldBranchDetached: !(window.__before.open as Node | undefined)
          ?.isConnected,
      }))
      assert.deepEqual(
        hidden.around,
        [true, true],
        'Show must not move its neighbours',
      )
      assert.ok(hidden.openReplaced, 'the hidden branch must be replaced')
      assert.equal(hidden.closed, 'closed')
      assert.ok(
        hidden.oldBranchDetached,
        'the hidden branch must be detached, not merely hidden',
      )

      await tab.evaluate(() => window.__handle.setOpen(true))
      await tab.waitForFunction(() => document.getElementById('open') !== null)
      assert.deepEqual(
        await survived(tab, ['before', 'after']),
        ['before', 'after'],
        're-showing must not move the neighbours',
      )
    },
  },
  {
    name: 'a keyed For reuses item nodes when the list is reordered',
    async run(tab) {
      await load(tab, 'for')
      const rendered = await tab.evaluate(() =>
        [...document.querySelectorAll('#list li')].map(
          item => (item as HTMLElement).dataset.id,
        ),
      )
      assert.deepEqual(rendered, ['a', 'b', 'c'])

      await tab.evaluate(() => {
        window.__byId = Object.fromEntries(
          [...document.querySelectorAll('#list li')].map(item => [
            (item as HTMLElement).dataset.id,
            item,
          ]),
        )
      })

      await tab.evaluate(() =>
        window.__handle.setItems([
          { id: 'c', label: 'C' },
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ]),
      )
      await tab.waitForFunction(
        () =>
          [...document.querySelectorAll('#list li')]
            .map(item => (item as HTMLElement).dataset.id)
            .join(',') === 'c,a,b',
      )

      assert.deepEqual(
        await tab.evaluate(() =>
          [...document.querySelectorAll('#list li')].map(
            item =>
              window.__byId[(item as HTMLElement).dataset.id ?? ''] === item,
          ),
        ),
        [true, true, true],
        'a reorder with stable keys must reuse every item node',
      )

      // Removing one item detaches exactly that node and leaves the others.
      await tab.evaluate(() => {
        window.__beforeRemoval = Object.fromEntries(
          [...document.querySelectorAll('#list li')].map(item => [
            (item as HTMLElement).dataset.id,
            item,
          ]),
        )
        window.__handle.setItems([
          { id: 'c', label: 'C' },
          { id: 'b', label: 'B' },
        ])
      })
      await tab.waitForFunction(
        () => document.querySelectorAll('#list li').length === 2,
      )
      const removed = await tab.evaluate(() => ({
        kept: [...document.querySelectorAll('#list li')].map(
          item =>
            window.__beforeRemoval[(item as HTMLElement).dataset.id ?? ''] ===
            item,
        ),
        removedDetached: !(window.__beforeRemoval.a as Node).isConnected,
      }))
      assert.deepEqual(
        removed.kept,
        [true, true],
        'surviving items keep their nodes',
      )
      assert.ok(removed.removedDetached, 'the removed item must be detached')
    },
  },
  {
    name: 'appending to a keyed list reuses every existing node',
    async run(tab) {
      await load(tab, 'for')
      await tab.evaluate(() => {
        window.__byId = Object.fromEntries(
          [...document.querySelectorAll('#list li')].map(item => [
            (item as HTMLElement).dataset.id,
            item,
          ]),
        )
        window.__handle.setItems([
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
          { id: 'c', label: 'C' },
          { id: 'd', label: 'D' },
        ])
      })
      await tab.waitForFunction(
        () => document.querySelectorAll('#list li').length === 4,
      )
      const reused = await tab.evaluate(() =>
        ['a', 'b', 'c'].map(
          id =>
            window.__byId[id] === document.querySelector(`[data-id="${id}"]`),
        ),
      )
      assert.deepEqual(
        reused,
        [true, true, true],
        'an append must not rebuild the items that were already there',
      )
    },
  },
  {
    name: 'replacing the whole list rebuilds every node',
    async run(tab) {
      await load(tab, 'for')
      const before = await tab.evaluate(() => {
        const nodes = [...document.querySelectorAll('#list li')]
        window.__beforeReplace = nodes
        window.__handle.setItems([
          { id: 'x', label: 'X' },
          { id: 'y', label: 'Y' },
        ])
        return nodes.length
      })
      await tab.waitForFunction(
        () => document.querySelectorAll('#list li').length === 2,
      )
      const reused = await tab.evaluate(
        () =>
          window.__beforeReplace.filter((node: Element) => node.isConnected)
            .length,
      )
      assert.equal(
        reused,
        0,
        `no old item may survive a full replacement, ${reused} did (of ${before})`,
      )
    },
  },
  {
    name: 'a changed label on the same key keeps the node',
    async run(tab) {
      await load(tab, 'for')
      await tab.evaluate(() => {
        window.__sameKey = document.querySelector('[data-id="b"]')
        window.__handle.setItems([
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B changed' },
          { id: 'c', label: 'C' },
        ])
      })
      await tab.waitForFunction(
        () =>
          document.querySelector('[data-id="b"]')?.textContent === 'B changed',
      )
      const survived = await tab.evaluate(
        () => window.__sameKey === document.querySelector('[data-id="b"]'),
      )
      assert.ok(survived, 'a keyed item whose data changed must keep its node')
    },
  },
  {
    name: 'rapid successive updates converge on the last list',
    async run(tab) {
      await load(tab, 'for')
      // Five synchronous writes in one evaluate: no frame between them, which
      // is the shape a user produces by holding a key down.
      await tab.evaluate(() => {
        for (let index = 1; index <= 5; index += 1) {
          window.__handle.setItems(
            Array.from({ length: index + 1 }, (_, position) => ({
              id: `k${position}`,
              label: `L${index}-${position}`,
            })),
          )
        }
      })
      await tab.waitForFunction(
        () => document.querySelectorAll('#list li').length === 6,
      )
      const state = await tab.evaluate(() => ({
        ids: [...document.querySelectorAll('#list li')].map(
          item => (item as HTMLElement).dataset.id,
        ),
        labels: [...document.querySelectorAll('#list li')].map(
          item => item.textContent,
        ),
      }))
      assert.deepEqual(state.ids, ['k0', 'k1', 'k2', 'k3', 'k4', 'k5'])
      assert.deepEqual(
        state.labels,
        ['L5-0', 'L5-1', 'L5-2', 'L5-3', 'L5-4', 'L5-5'],
        'the last write must win for every row',
      )
    },
  },
]

// ---- Run --------------------------------------------------------------------

/**
 * Runs every check once per engine.
 *
 * A fresh page per engine, so one engine's state cannot leak into the next.
 * Each check is independent of the others by construction — every one of them
 * navigates and mounts its own fixture — so a failure in Firefox does not stop
 * WebKit from being measured.
 */
const outcomes = await runAcrossEngines({
  outputDir: output,
  async run(tab) {
    const results: EngineCheckResult[] = []
    const pageErrors: string[] = []
    tab.on('pageerror', error => pageErrors.push(error.message))

    for (const check of checks) {
      try {
        await check.run(tab)
        results.push({ check: check.name, status: 'passed' })
      } catch (error) {
        results.push({
          check: check.name,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
        // A screenshot is what makes a browser failure actionable from a log.
        await fs.mkdir(output, { recursive: true })
        await tab.screenshot({
          path: path.join(output, `${check.name.replace(/\W+/g, '-')}.png`),
          fullPage: true,
        })
      }
    }

    results.push(
      pageErrors.length === 0
        ? { check: 'no uncaught page errors', status: 'passed' }
        : {
            check: 'no uncaught page errors',
            status: 'failed',
            error: pageErrors.join('\n'),
          },
    )
    return results
  },
})

reportAcrossEngines(outcomes, 'DOM precise updates')
// The server holds a handle, so without this the process never exits and CI
// waits for the job timeout. The other checks call it; this one lost the call
// when its run block was rewritten, and the first `browser-runtime` run sat in
// `DOM precise updates` for twenty minutes before being killed.
await new Promise<void>(resolve => server.close(() => resolve()))
