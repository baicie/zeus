/**
 * Nested control flow creates and destroys its scopes exactly once (TASK 15 / R21).
 *
 * `<Show>` and `<For>` compile to region anchors that mount and unmount a
 * subtree. The interesting question is not what the DOM looks like afterwards —
 * a framework that rebuilt everything on every toggle would render the same
 * HTML — but whether each branch created one reactive scope and disposed it on
 * the way out.
 *
 * The counters come from the runtime's own diagnostics session
 * (`@zeus-js/signal/diagnostics`), the same one `check:hmr-browser` uses. It
 * records scopes created and disposed, effects created and disposed, and
 * listeners added and removed.
 *
 * ## What "exactly once" means here
 *
 * Toggling a Show from open to closed and back must create two scopes and
 * dispose one, leaving one live. Toggling a For from three items to one must
 * dispose two item scopes. If the numbers drift, a scope leaked or was disposed
 * twice, and a leak of that kind is invisible in the DOM.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:nested-scopes-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:nested-scopes-browser
 * ```
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

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/nested-scopes-browser')

/**
 * Two fixtures.
 *
 * `show-in-for` is the nested case: an outer For whose items each contain a
 * Show. Toggling one item's Show must create and destroy only that item's
 * inner scope.
 *
 * `for-in-show` is the reverse: a Show whose open branch contains a For.
 * Closing the Show must dispose the For's item scopes with it.
 */
const FIXTURES = {
  'show-in-for': [
    "import { For, Show, createSignal, render } from '@zeus-js/zeus'",
    '',
    "const [items, setItems] = createSignal(['a', 'b', 'c'])",
    'const [visible, setVisible] = createSignal(new Set())',
    '',
    'function App() {',
    '  return (',
    '    <ul id="list">',
    '      <For each={items()} by={item => item}>',
    '        {item => (',
    '          <li data-id={item}>',
    '            <Show when={visible().has(item)} fallback={<i>hidden</i>}>',
    '              <b class="shown">{item}</b>',
    '            </Show>',
    '          </li>',
    '        )}',
    '      </For>',
    '    </ul>',
    '  )',
    '}',
    '',
    'export function mount(container) {',
    '  render(App, container)',
    '  return { setItems, setVisible }',
    '}',
  ].join('\n'),

  'for-in-show': [
    "import { For, Show, createSignal, render } from '@zeus-js/zeus'",
    '',
    'const [open, setOpen] = createSignal(true)',
    "const [rows, setRows] = createSignal(['x', 'y'])",
    '',
    'function App() {',
    '  return (',
    '    <section id="host">',
    '      <Show when={open()} fallback={<p id="closed">closed</p>}>',
    '        <ul id="inner">',
    '          <For each={rows()} by={row => row}>',
    '            {row => <li data-row={row}>{row}</li>}',
    '          </For>',
    '        </ul>',
    '      </Show>',
    '    </section>',
    '  )',
    '}',
    '',
    'export function mount(container) {',
    '  render(App, container)',
    '  return { setOpen, setRows }',
    '}',
  ].join('\n'),
} as const

function compile(name: string, source: string): string {
  const compiler = require(
    path.join(root, 'packages/compiler/compiler/dist/compiler.cjs'),
  ) as {
    transformModule: (options: Record<string, unknown>) => {
      code: string
      diagnostics: Array<{ code: string; message: string }>
    }
  }
  const result = compiler.transformModule({
    source,
    filename: `${name}.tsx`,
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
    hmr: false,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `${name}: must compile cleanly, got ${JSON.stringify(result.diagnostics)}`,
  )
  return result.code
}

const compiled = Object.fromEntries(
  Object.entries(FIXTURES).map(([name, source]) => [
    name,
    compile(name, source),
  ]),
)

const read = (relative: string) =>
  fs.readFile(path.join(root, relative), 'utf8')

const modules: Record<string, string> = {
  '/zeus.js': await read('packages/core/zeus/dist/zeus.esm-bundler.js'),
  '/runtime-dom.js': await read(
    'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
  ),
  '/signal.js': await read('packages/core/signal/dist/signal.esm-bundler.js'),
  '/signal-internal.js': await read('packages/core/signal/dist/internal.js'),
  '/signal-diagnostics.js': await read(
    'packages/core/signal/dist/diagnostics.js',
  ),
  '/shared.js': await read('packages/core/shared/dist/shared.esm-bundler.js'),
  '/fixtures/show-in-for.js': compiled['show-in-for'],
  '/fixtures/for-in-show.js': compiled['for-in-show'],
  '/harness.js': await read('scripts/check/fixtures/nested-scopes-harness.js'),
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>nested-scopes</title>
<script type="importmap">
{ "imports": {
    "@zeus-js/zeus": "/zeus.js",
    "@zeus-js/runtime-dom": "/runtime-dom.js",
    "@zeus-js/signal": "/signal.js",
    "@zeus-js/signal/internal": "/signal-internal.js",
    "@zeus-js/signal/diagnostics": "/signal-diagnostics.js",
    "@zeus-js/shared": "/shared.js"
} }
</script>
</head>
<body>
<div id="app"></div>
<script type="module">
import * as harness from '/harness.js'
window.__harness = harness
window.__ready = true
</script>
</body>
</html>`

const server = http.createServer((request, response) => {
  // Strip the query: a dynamic `import()` of an already-loaded module, or a
  // browser retry, can append `?t=…`, and looking that key up in `modules`
  // falls through to the HTML page — which the browser then parses as
  // JavaScript and reports as `Unexpected token ')'`.
  const url = (request.url ?? '/').split('?')[0]
  const module = modules[url]
  if (module !== undefined) {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(module)
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

type Snapshot = Record<string, number>

/** Loads the page and mounts one fixture inside a diagnostics session. */
async function open(tab: Page, name: keyof typeof FIXTURES): Promise<void> {
  await tab.goto(origin)
  await tab.waitForFunction('window.__ready === true')
  const probe = await tab.evaluate(
    'typeof window.__harness + "|" + typeof window.__harness?.mount',
  )
  console.log(`[harness probe] ${probe}`)
  // Awaiting inside the page, then returning a primitive: `evaluate` resolves a
  // returned promise, but only when the value it gets back is serialisable.
  // Returning the module namespace here was what produced
  // `Unexpected token ')'` from the harness's own source.
  // The page reports the failure itself: an exception thrown inside the
  // harness or a fixture module arrives here as a serialisable string instead
  // of a bare Playwright `SyntaxError` with no location.
  const outcome = await tab.evaluate(
    `window.__harness.mount(${JSON.stringify(name)})
       .then(() => 'ok')
       .catch(error => 'ERR: ' + (error && error.stack ? error.stack : String(error)))`,
  )
  if (outcome !== 'ok') {
    throw new Error(`mounting ${name} failed: ${String(outcome).slice(0, 800)}`)
  }
  // The fixture renders synchronously inside the session, so the first
  // `waitForFunction` in each check is what waits for its DOM.
}

const snapshot = (tab: Page): Promise<Snapshot> =>
  tab.evaluate('window.__harness.snapshot()')

const call = (tab: Page, method: string, argument: unknown): Promise<void> =>
  tab.evaluate(
    `window.__harness.call(${JSON.stringify(method)}, ${JSON.stringify(argument)})`,
  )

const setVisible = (tab: Page, values: string[]): Promise<void> =>
  tab.evaluate(`window.__harness.setVisible(${JSON.stringify(values)})`)

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: 'toggling one item inside a For creates one scope and disposes it',
    async run(tab) {
      await open(tab, 'show-in-for')

      const before = await snapshot(tab)
      await setVisible(tab, ['b'])
      await tab.waitForFunction(
        () => document.querySelectorAll('#list .shown').length === 1,
      )
      const opened = await snapshot(tab)
      assert.ok(
        opened.scopesCreated > before.scopesCreated,
        `opening a nested Show must create a scope: ${JSON.stringify({ before, opened })}`,
      )

      // Close it again: the scope it created must be disposed.
      await setVisible(tab, [])
      await tab.waitForFunction(
        () => document.querySelectorAll('#list .shown').length === 0,
      )
      const closed = await snapshot(tab)
      const liveScopes = (snapshot: Snapshot) =>
        snapshot.scopesCreated - snapshot.scopesDisposed
      assert.equal(
        liveScopes(closed),
        liveScopes(before),
        `closing the nested Show must return the live scope count to where ` +
          `it started: ${JSON.stringify({ before: liveScopes(before), closed: liveScopes(closed) })}`,
      )
    },
  },
  {
    name: 'removing a For item disposes that item scope and no other',
    async run(tab) {
      await open(tab, 'show-in-for')
      const before = await snapshot(tab)
      const liveBefore = before.scopesCreated - before.scopesDisposed

      await call(tab, 'setItems', ['a', 'c'])
      await tab.waitForFunction(
        () => document.querySelectorAll('#list li').length === 2,
      )
      const after = await snapshot(tab)
      const liveAfter = after.scopesCreated - after.scopesDisposed
      // Two scopes, not one: each `<li>` contains a `<Show>`, so removing an
      // item disposes the item's scope and the Show scope inside it. The
      // assertion is on the difference, which is what "only that item" means —
      // a leak elsewhere would show as a smaller drop, and a double-dispose as
      // a larger one.
      assert.equal(
        liveAfter,
        liveBefore - 2,
        `removing one item must dispose that item's scope and the Show inside ` +
          `it: ${JSON.stringify({ liveBefore, liveAfter })}`,
      )
    },
  },
  {
    name: 'closing a Show disposes the For scopes inside it',
    async run(tab) {
      await open(tab, 'for-in-show')
      const opened = await snapshot(tab)
      const liveOpen = opened.scopesCreated - opened.scopesDisposed

      await call(tab, 'setOpen', false)
      await tab.waitForFunction(
        () => document.getElementById('closed') !== null,
      )
      const closed = await snapshot(tab)
      const liveClosed = closed.scopesCreated - closed.scopesDisposed
      assert.ok(
        liveClosed < liveOpen,
        `closing the Show must dispose the For scopes inside it: ` +
          `${JSON.stringify({ liveOpen, liveClosed })}`,
      )

      // And reopening recreates them: the DOM must match, not just the count.
      await call(tab, 'setOpen', true)
      await tab.waitForFunction(
        () => document.querySelectorAll('#inner li').length === 2,
      )
      const reopened = await snapshot(tab)
      assert.equal(
        reopened.scopesCreated - reopened.scopesDisposed,
        liveOpen,
        `reopening must restore the same number of live scopes: ` +
          `${JSON.stringify({ liveOpen, reopened })}`,
      )
    },
  },
  {
    name: 'no listener is left behind after repeated toggling',
    async run(tab) {
      await open(tab, 'show-in-for')
      const before = await snapshot(tab)
      const liveBefore = before.scopesCreated - before.scopesDisposed
      for (let index = 0; index < 5; index += 1) {
        await setVisible(tab, ['a'])
        await tab.waitForFunction(
          () => document.querySelectorAll('#list .shown').length === 1,
        )
        await setVisible(tab, [])
        await tab.waitForFunction(
          () => document.querySelectorAll('#list .shown').length === 0,
        )
      }
      await tab.waitForFunction(
        () => document.querySelectorAll('#list .shown').length === 0,
      )
      const after = await snapshot(tab)
      assert.equal(
        after.listenersCreated,
        after.listenersDisposed,
        `five open/close cycles must leave no listener: ${JSON.stringify(after)}`,
      )
      // Every open created a scope and every close disposed it, so the live
      // count returns to where it started. Asserting an absolute number was
      // this check's error: the initial tree already holds seven (three For
      // items plus each Show's fallback branch), and five toggles leave it at
      // seven — measured independently before the assertion was written.
      assert.equal(
        after.scopesCreated - after.scopesDisposed,
        liveBefore,
        `five open/close cycles must return the live scope count to its ` +
          `starting value: ${JSON.stringify({ liveBefore, after })}`,
      )
    },
  },
]

const outcomes = await runAcrossEngines({
  outputDir: output,
  async run(tab) {
    const results: EngineCheckResult[] = []
    const pageErrors: string[] = []
    tab.on('pageerror', error => pageErrors.push(error.message))

    tab.on('console', message => {
      if (message.type() === 'error')
        console.log(`[page error] ${message.text()}`)
    })
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

reportAcrossEngines(outcomes, 'Nested scopes')
await new Promise<void>(resolve => server.close(() => resolve()))
