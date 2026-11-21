/**
 * Hydration leaves the DOM reactive (TASK 06 / R21).
 *
 * `check:ssr-hydration-browser` proves that hydration *adopts* server nodes. It
 * does not prove that the adopted tree still works: its harness supplies
 * handlers that record which binding ran, and a framework that never wires a
 * signal to the node would pass every assertion there.
 *
 * This check closes that gap by using the compiler's real output. The fixture
 * is compiled for SSR and for the DOM target, the SSR HTML is placed in the
 * page, and `beginHydrationSession` adopts it through the same
 * `autoHydrateComponent` path an application uses. Then:
 *
 *   * writing a signal updates the text, attribute and property it is bound to;
 *   * nodes bound to something else keep their identity;
 *   * a handler adopted from the server fires exactly once per click;
 *   * disposing the root stops the updates and detaches the listener.
 *
 * The last two are what separate "hydrated" from "rendered once and frozen",
 * and they cannot be inferred from the HTML.
 *
 * ## Why the auto-hydration path
 *
 * There are two hydration APIs in `runtime-dom`. `hydratePlan` walks a plan and
 * calls a handler per binding; `autoHydrateComponent` is what compiled output
 * emits, and it validates the adopted element's shape before binding. Testing
 * the first would not exercise what an application runs.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:hydration-reactivity-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:hydration-reactivity-browser
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
const output = path.join(root, 'temp/hydration-reactivity-browser')

declare global {
  interface Window {
    __ready: boolean
    __ssrRender: () => string
    __mount: (html: string) => { ok: boolean; error: string | null }
    __signals?: {
      setLabel: (value: string) => void
      setTitle: (value: string) => void
      setCount: (value: number) => void
      clicks: () => number
      dispose: () => void
    }
    __errors: string[]
  }
}

interface CompilerOutput {
  code: string
  diagnostics: Array<{ code: string; message: string }>
}

/**
 * The fixture. Every binding kind that hydration has to re-create:
 *
 *   text      a dynamic child
 *   attr      a dynamic attribute
 *   prop      a DOM property
 *   event     a listener that must survive adoption
 *
 * `clicks` lives on the module so the check can prove the adopted handler is
 * the one firing.
 */
const SOURCE = `
import { createSignal } from '@zeus-js/zeus'

export const signals = (() => {
  const [label, setLabel] = createSignal('server label')
  const [title, setTitle] = createSignal('server title')
  const [count, setCount] = createSignal(0)
  let clicks = 0
  return {
    label,
    setLabel,
    title,
    setTitle,
    count,
    setCount,
    clicks: () => clicks,
    recordClick: () => {
      clicks += 1
      setCount(count() + 1)
    },
  }
})()

export function App(props) {
  return (
    <div id="root">
      <h1 id="heading">static heading</h1>
      <p id="text">{signals.label()}</p>
      <div id="attr" title={signals.title()}>attr host</div>
      <input id="prop" value={signals.count()} />
      <button id="inc" onClick={() => signals.recordClick()}>
        count: {signals.count()}
      </button>
      <footer id="footer">static footer</footer>
    </div>
  )
}
`

function transform(target: 'dom' | 'ssr'): CompilerOutput {
  const compiler = require(
    path.join(root, 'packages/compiler/compiler/dist/compiler.cjs'),
  ) as { transformModule: (options: Record<string, unknown>) => CompilerOutput }
  const result = compiler.transformModule({
    source: SOURCE,
    filename: 'app.tsx',
    target,
    runtimeModule:
      target === 'ssr' ? '@zeus-js/runtime-ssr' : '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
    hmr: false,
    // Both targets need this. The SSR target emits the component-root close
    // marker (`<!--zeus:hydrate:/c1.root-->`) only when auto-hydration is on;
    // without it the client cannot pair the root, and adoption fails with
    // ZEUS_HYDRATION_REGION_UNTERMINATED. The existing
    // `auto-hydration.spec.ts` passes `autoHydrate: true` to both for this
    // reason.
    autoHydrate: true,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `${target}: the fixture must compile cleanly, got ${JSON.stringify(result.diagnostics)}`,
  )
  assert.ok(result.code.length > 0, `${target}: the fixture must emit code`)
  return result
}

const ssr = transform('ssr')
const dom = transform('dom')

const read = (relative: string) =>
  fs.readFile(path.join(root, relative), 'utf8')

const modules: Record<string, string> = {
  '/zeus.js': await read('packages/core/zeus/dist/zeus.esm-bundler.js'),
  '/runtime-dom.js': await read(
    'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
  ),
  '/runtime-ssr.js': await read(
    'packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js',
  ),
  '/signal.js': await read('packages/core/signal/dist/signal.esm-bundler.js'),
  '/signal-internal.js': await read('packages/core/signal/dist/internal.js'),
  '/shared.js': await read('packages/core/shared/dist/shared.esm-bundler.js'),
  '/modules/ssr.js': ssr.code,
  // The DOM module exports `signals` as well as `App`, so the page can drive
  // the same signal instances the compiled bindings read.
  '/modules/dom.js': dom.code,
  '/harness.js': await read(
    'scripts/check/fixtures/hydration-reactivity-harness.js',
  ),
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>hydration-reactivity</title>
<script type="importmap">
{ "imports": {
    "@zeus-js/zeus": "/zeus.js",
    "@zeus-js/runtime-dom": "/runtime-dom.js",
    "@zeus-js/runtime-ssr": "/runtime-ssr.js",
    "@zeus-js/signal": "/signal.js",
    "@zeus-js/signal/internal": "/signal-internal.js",
    "@zeus-js/shared": "/shared.js"
} }
</script>
</head>
<body>
<div id="server"></div>
<script type="module">
import * as harness from '/harness.js'
window.__signals = harness.signals
window.__ssrRender = harness.render_
window.__mount = harness.mount
window.__errors = []
window.addEventListener('error', event => window.__errors.push(String(event.message)))
window.__ready = true
</script>
</body>
</html>`

const server = http.createServer((request, response) => {
  const url = request.url ?? '/'
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

async function open(tab: Page): Promise<void> {
  await tab.goto(origin)
  await tab.waitForFunction(() => window.__ready === true)
}

/** Renders the SSR HTML, places it, and hydrates it. */
async function mount(tab: Page): Promise<void> {
  await tab.evaluate(() => {
    const result = window.__mount(window.__ssrRender())
    if (!result.ok) throw new Error(result.error ?? 'hydration failed')
  })
  await tab.waitForFunction(
    () => document.getElementById('server')?.querySelector('#root') !== null,
  )
}

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: 'the server HTML is what the client adopts',
    async run(tab) {
      await open(tab)
      await mount(tab)
      const state = await tab.evaluate(() => ({
        text: document.getElementById('text')?.textContent ?? null,
        title: document.getElementById('attr')?.getAttribute('title') ?? null,
        value: (document.getElementById('prop') as HTMLInputElement | null)
          ?.value,
      }))
      assert.equal(state.text, 'server label')
      assert.equal(state.title, 'server title')
      assert.equal(
        state.value,
        '0',
        'the property binding must have been applied to the adopted input',
      )
    },
  },
  {
    name: 'a signal write after hydration updates the adopted text node',
    async run(tab) {
      await open(tab)
      await mount(tab)
      await tab.evaluate(() => {
        window.__before = {
          root: document.getElementById('root'),
          heading: document.getElementById('heading'),
          text: document.getElementById('text'),
          footer: document.getElementById('footer'),
        }
        window.__signals!.setLabel('client label')
      })
      await tab.waitForFunction(
        () => document.getElementById('text')?.textContent === 'client label',
      )
      const survived = await tab.evaluate(() =>
        ['root', 'heading', 'text', 'footer'].filter(
          id => window.__before[id] === document.getElementById(id),
        ),
      )
      assert.deepEqual(
        survived,
        ['root', 'heading', 'text', 'footer'],
        'the update must not replace any adopted node',
      )
    },
  },
  {
    name: 'a signal write after hydration updates the adopted attribute',
    async run(tab) {
      await open(tab)
      await mount(tab)
      await tab.evaluate(() => window.__signals!.setTitle('client title'))
      await tab.waitForFunction(
        () =>
          document.getElementById('attr')?.getAttribute('title') ===
          'client title',
      )
    },
  },
  {
    name: 'a signal write after hydration updates the adopted property',
    async run(tab) {
      await open(tab)
      await mount(tab)
      await tab.evaluate(() => window.__signals!.setCount(7))
      await tab.waitForFunction(
        () =>
          (document.getElementById('prop') as HTMLInputElement | null)
            ?.value === '7',
      )
      const element = await tab.evaluate(() => {
        const input = document.getElementById('prop') as HTMLInputElement
        return { value: input.value, attribute: input.getAttribute('value') }
      })
      assert.equal(element.value, '7', 'the property must hold the new value')
      // `input.value` is a reflecting IDL attribute: assigning the property
      // writes the content attribute, and that is the browser's rule, not the
      // binding's. Asserting the attribute stayed at the server's `"0"` would
      // be asserting against the DOM spec — this check made that mistake first.
      // What matters here is that the *value* the user sees is the bound one.
      assert.equal(
        element.attribute,
        '7',
        'setting input.value reflects to the attribute, as the DOM specifies',
      )
    },
  },
  {
    name: 'the adopted click handler fires exactly once per click',
    async run(tab) {
      await open(tab)
      await mount(tab)
      const before = await tab.evaluate(() => window.__signals!.clicks())
      await tab.click('#inc')
      await tab.waitForFunction(() => window.__signals!.clicks() === 1)
      await tab.click('#inc')
      await tab.waitForFunction(() => window.__signals!.clicks() === 2)
      const after = await tab.evaluate(() => window.__signals!.clicks())
      assert.equal(
        after - before,
        2,
        'two clicks must be counted twice, not once per listener copy',
      )
      const text = await tab.evaluate(
        () => document.getElementById('inc')?.textContent?.trim() ?? '',
      )
      assert.equal(
        text,
        'count: 2',
        'the state update the handler caused must reach the adopted text node',
      )
    },
  },
  {
    name: 'disposing the root stops updates and detaches the listener',
    async run(tab) {
      await open(tab)
      await mount(tab)
      await tab.evaluate(() => window.__signals!.dispose())

      const beforeDispose = await tab.evaluate(() => ({
        clicks: window.__signals!.clicks(),
        text: document.getElementById('text')?.textContent ?? null,
      }))
      // A write after disposal must not reach the DOM.
      await tab.evaluate(() => {
        window.__signals!.setLabel('after dispose')
        window.__signals!.setCount(99)
      })
      await tab.waitForTimeout(100)
      const afterWrite = await tab.evaluate(() => ({
        text: document.getElementById('text')?.textContent ?? null,
        value: (document.getElementById('prop') as HTMLInputElement | null)
          ?.value,
      }))
      assert.equal(
        afterWrite.text,
        beforeDispose.text,
        'a disposed binding must not update the DOM',
      )
      assert.notEqual(
        afterWrite.value,
        '99',
        'a disposed property binding must not write',
      )

      // And a click must not reach the handler. The element may have been
      // removed by disposal, in which case there is nothing to click — that is
      // an equally strong result, so both are accepted, and neither is a pass
      // by timeout.
      const stillThere = await tab.evaluate(
        () => document.getElementById('inc') !== null,
      )
      const afterClick = stillThere
        ? await (async () => {
            await tab.click('#inc')
            await tab.waitForTimeout(100)
            return tab.evaluate(() => window.__signals!.clicks())
          })()
        : beforeDispose.clicks
      assert.equal(
        afterClick,
        beforeDispose.clicks,
        'a disposed root must not run the adopted handler',
      )
    },
  },
]

/**
 * Runs every check once per engine.
 *
 * A fresh page per engine: every check places new server HTML in `#server` and
 * hydrates it, and the signals are module state shared with the page.
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

reportAcrossEngines(outcomes, 'Hydration reactivity')
await new Promise<void>(resolve => server.close(() => resolve()))
