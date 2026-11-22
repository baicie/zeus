/**
 * Delegated and directly-bound events behave the way the compiler decides (TASK 16 / R21).
 *
 * The compiler decides per event name whether a handler is delegated to
 * `document` or bound to the element:
 *
 *   * a name containing `-` or an uppercase letter is bound directly — those
 *     are custom events and DOM property-style names, and delegation would key
 *     on the wrong event;
 *   * a name in the non-bubbling set (`mouseenter`, `focus`, `load`, …) is
 *     bound directly, because a delegated listener on `document` would never
 *     see it;
 *   * everything else is delegated.
 *
 * Both paths have to behave identically from the application's point of view,
 * and the difference has to be invisible until something relies on it:
 * `stopPropagation` in a delegated handler cannot stop another *delegated*
 * handler that already ran, while it does stop a directly-bound ancestor.
 *
 * ## What is asserted
 *
 *   * a click on a nested button calls exactly one handler per click, not one
 *     per ancestor;
 *   * `mouseenter` (non-bubbling) reaches its handler, which a delegated
 *     listener could not;
 *   * a custom `z-ping` event reaches its handler;
 *   * `stopPropagation` in a delegated child handler prevents a delegated
 *     ancestor handler — the delegation dispatcher walks the path itself, so
 *     this is the behaviour that could plausibly be wrong;
 *   * removing a component's subtree stops its handler from firing.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:event-delegation-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:event-delegation-browser
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

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/event-delegation-browser')

const SOURCE = [
  "import { Show, For, createSignal, render } from '@zeus-js/zeus'",
  '',
  'const [open, setOpen] = createSignal(true)',
  "const [rows, setRows] = createSignal(['a', 'b'])",
  '',
  'function App(props) {',
  '  return (',
  '    <section id="root" onClick={() => props.log("ancestor")}>',
  '      <button',
  '        id="child"',
  '        onClick={(event) => {',
  '          props.log("child")',
  '          if (props.stop) event.stopPropagation()',
  '        }}',
  '      >',
  '        click',
  '      </button>',
  '      <div id="hover" onMouseEnter={() => props.log("mouseenter")}>hover</div>',
  '      <div id="custom" on:z-ping={() => props.log("custom")}>custom</div>',
  '      <Show when={open()}>',
  '        <button id="conditional" onClick={() => props.log("conditional")}>c</button>',
  '      </Show>',
  '      <ul id="list">',
  '        <For each={rows()} by={row => row}>',
  '          {row => (',
  '            <li>',
  '              <button data-row={row} onClick={() => props.log(`row:${row}`)}>{row}</button>',
  '            </li>',
  '          )}',
  '        </For>',
  '      </ul>',
  '    </section>',
  '  )',
  '}',
  '',
  'export function mount(container, props) {',
  '  const dispose = render(() => App(props), container)',
  '  return { dispose, setOpen, setRows }',
  '}',
].join('\n')

function compile(): string {
  const compiler = require(
    path.join(root, 'packages/compiler/compiler/dist/compiler.cjs'),
  ) as {
    transformModule: (options: Record<string, unknown>) => {
      code: string
      diagnostics: Array<{ code: string; message: string }>
    }
  }
  const result = compiler.transformModule({
    source: SOURCE,
    filename: 'events.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    // Delegation on: the point is the delegated path.
    delegateEvents: true,
    sourceMap: false,
    hmr: false,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `the fixture must compile cleanly, got ${JSON.stringify(result.diagnostics.map(d => d.code))}`,
  )
  assert.ok(
    result.code.includes('delegateEvents'),
    `the fixture must actually delegate something:\n${result.code.slice(0, 400)}`,
  )
  return result.code
}

const compiled = compile()
const read = (relative: string) =>
  fs.readFile(path.join(root, relative), 'utf8')

const modules: Record<string, string> = {
  '/zeus.js': await read('packages/core/zeus/dist/zeus.esm-bundler.js'),
  '/runtime-dom.js': await read(
    'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
  ),
  '/signal.js': await read('packages/core/signal/dist/signal.esm-bundler.js'),
  '/signal-internal.js': await read('packages/core/signal/dist/internal.js'),
  '/shared.js': await read('packages/core/shared/dist/shared.esm-bundler.js'),
  '/fixture.js': compiled,
  '/harness.js': await read(
    'scripts/check/fixtures/event-delegation-harness.js',
  ),
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>event-delegation</title>
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
import * as harness from '/harness.js'
window.__harness = harness
window.__ready = true
</script>
</body>
</html>`

const server = http.createServer((request, response) => {
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

/** Loads the page and mounts the fixture, returning the recorded log. */
async function open(
  tab: import('@playwright/test').Page,
  options: { stop?: boolean } = {},
): Promise<void> {
  await tab.goto(origin)
  await tab.waitForFunction('window.__ready === true')
  await tab.evaluate(
    `window.__harness.mount(${JSON.stringify(Boolean(options.stop))})`,
  )
  await tab.waitForFunction('document.getElementById("child") !== null')
}

const log = (tab: import('@playwright/test').Page): Promise<string[]> =>
  tab.evaluate('window.__harness.entries()')

const reset = (tab: import('@playwright/test').Page): Promise<void> =>
  tab.evaluate('window.__harness.reset()')

const checks: Array<{
  name: string
  run: (tab: import('@playwright/test').Page) => Promise<void>
}> = [
  {
    name: 'a click on a nested button calls each handler once',
    async run(tab) {
      await open(tab)
      await tab.click('#child')
      const entries = await log(tab)
      assert.deepEqual(
        entries.sort(),
        ['ancestor', 'child'],
        `one click must run the child handler once and the ancestor once: ${JSON.stringify(entries)}`,
      )
    },
  },
  {
    name: 'mouseenter reaches its handler even though it does not bubble',
    async run(tab) {
      await open(tab)
      // `mouseenter` is in the non-delegating set precisely because a document
      // listener would never see it. Dispatching it on the element is what a
      // pointer would do.
      await tab.evaluate(
        'document.getElementById("hover").dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }))',
      )
      const entries = await log(tab)
      assert.ok(
        entries.includes('mouseenter'),
        `a non-bubbling event must reach its directly-bound handler: ${JSON.stringify(entries)}`,
      )
    },
  },
  {
    name: 'a hyphenated custom event reaches its handler',
    async run(tab) {
      await open(tab)
      await tab.evaluate(
        'document.getElementById("custom").dispatchEvent(new CustomEvent("z-ping", { bubbles: true }))',
      )
      const entries = await log(tab)
      assert.ok(
        entries.includes('custom'),
        `a custom event must reach its handler: ${JSON.stringify(entries)}`,
      )
    },
  },
  {
    name: 'stopPropagation in a delegated handler stops the delegated ancestor',
    async run(tab) {
      await open(tab, { stop: true })
      await tab.click('#child')
      const entries = await log(tab)
      assert.deepEqual(
        entries,
        ['child'],
        `stopPropagation must keep the ancestor handler from running: ${JSON.stringify(entries)}`,
      )
    },
  },
  {
    name: 'closing a Show stops its handler from firing',
    async run(tab) {
      await open(tab)
      await tab.click('#conditional')
      const before = await log(tab)
      assert.ok(
        before.includes('conditional'),
        `the conditional button must work while shown: ${JSON.stringify(before)}`,
      )

      await reset(tab)
      await tab.evaluate('window.__harness.setOpen(false)')
      await tab.waitForFunction(
        'document.getElementById("conditional") === null',
      )
      // The element is gone, so there is nothing to click; the assertion is
      // that a click elsewhere does not reach it either. Dispatch on the
      // section, which is what a stale listener on `document` would catch.
      await tab.evaluate(
        'document.getElementById("root").dispatchEvent(new MouseEvent("click", { bubbles: true }))',
      )
      const after = await log(tab)
      assert.ok(
        !after.includes('conditional'),
        `a removed branch must not keep a live handler: ${JSON.stringify(after)}`,
      )
    },
  },
  {
    name: 'a For item handler fires for its own row only',
    async run(tab) {
      await open(tab)
      await tab.click('[data-row="b"]')
      const entries = await log(tab)
      assert.deepEqual(
        entries.filter(entry => entry.startsWith('row:')),
        ['row:b'],
        `clicking one row must not run another row's handler: ${JSON.stringify(entries)}`,
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

reportAcrossEngines(outcomes, 'Event delegation')
await new Promise<void>(resolve => server.close(() => resolve()))
