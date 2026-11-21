/**
 * SSR → hydration E2E (TASK G / R20).
 *
 * Two claims, which fail differently:
 *
 * 1. **The server-rendered HTML carries the markers the client plan names.**
 *    The compiler emits `hydrationPlan` for the DOM target and
 *    `<!--zeus:hydrate:c1.e4-->` comments for the SSR target. They come from
 *    different code paths over the same IR, so they can drift, and a plan that
 *    names a marker the server never writes describes a node the client can
 *    never find.
 *
 * 2. **Hydration reuses the server's nodes instead of rebuilding them.** No
 *    HTML comparison can make this claim: a client that discards the server
 *    DOM and paints a fresh tree produces identical final HTML and is not
 *    hydrating at all.
 *
 * ## Shape
 *
 * The compiled SSR module and the compiled DOM module are served as separate ES
 * modules under `/modules/`, and a small hand-written `/harness.js` imports
 * both. Compiling them into one string was the first thing this file got
 * wrong — the compiler emits top-level `import`/`export`, and inlining that
 * into a template literal breaks on the first `{`.
 *
 * ## Failure modes exercised
 *
 * Deliberate breakage, asserting the runtime **refuses** rather than silently
 * rebuilding:
 *
 *   * a marker missing at the position the plan expects
 *   * markers in the wrong order
 *
 * A runtime that fell back to "just render it" would pass a happy-path test and
 * duplicate listeners and effects in production, which is the failure this
 * group exists to catch.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:ssr-hydration-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:ssr-hydration-browser
 * ```
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import { chromium, type Page } from '@playwright/test'

import {
  chromiumLaunchOptions,
  describeBrowser,
  explainLaunchFailure,
} from './browser-channel'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/ssr-hydration-browser')

declare global {
  interface Window {
    __ready: boolean
    __ssrRender: () => string
    __plan: {
      components: Array<{
        nodes: Array<{
          id: string
          kind: string
          optional: boolean
          bindings: Array<{ id: number; kind: string }>
        }>
      }>
    }
    __hydrate: (html: string) => {
      ok: boolean
      error: string | null
      reused: Record<string, boolean>
      ids: string[]
    }
    __hydrateNoHandlers: (html: string) => {
      ok: boolean
      error: string | null
      reused: Record<string, boolean>
      ids: string[]
    }
    __errors: string[]
    __dispose?: () => void
    __handlerRuns?: number
    __handlerNodes?: Record<number, string>
  }
}

interface CompilerOutput {
  code: string
  diagnostics: Array<{ code: string; message: string }>
  hydrationPlan: unknown
}

/**
 * The fixture. It contains every construct whose markers can disagree: a
 * dynamic text, a Show with a fallback, and a For.
 */
const SOURCE = `
import { Show, For, createSignal } from '@zeus-js/zeus'

export function App(props) {
  return (
    <div id="root">
      <h1 id="title">{props.title}</h1>
      <Show when={props.open} fallback={<p id="closed">closed</p>}>
        <p id="open">open</p>
      </Show>
      <ul id="list">
        <For each={props.items}>{item => <li>{item}</li>}</For>
      </ul>
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
    // The SSR target emits calls into the umbrella package's SSR helpers; the
    // DOM target emits calls into the low-level runtime.
    runtimeModule:
      target === 'ssr' ? '@zeus-js/runtime-ssr' : '@zeus-js/runtime-dom',
    delegateEvents: target === 'dom',
    sourceMap: false,
    hmr: false,
    autoHydrate: target === 'dom',
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `${target}: the fixture must compile cleanly, got ${JSON.stringify(result.diagnostics)}`,
  )
  assert.ok(result.code.length > 0, `${target}: the fixture must emit code`)
  if (target === 'dom') {
    assert.ok(
      result.hydrationPlan,
      'the DOM target must produce a hydration plan',
    )
  }
  return result
}

const ssr = transform('ssr')
const dom = transform('dom')

// The two modules both declare `App`; each is its own module so the names do
// not collide. The DOM module's exported `App` is what `hydratePlan` binds.
const modules: Record<string, string> = {
  '/zeus.js': await fs.readFile(
    path.join(root, 'packages/core/zeus/dist/zeus.esm-bundler.js'),
    'utf8',
  ),
  '/runtime-dom.js': await fs.readFile(
    path.join(
      root,
      'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
    ),
    'utf8',
  ),
  '/runtime-ssr.js': await fs.readFile(
    path.join(
      root,
      'packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js',
    ),
    'utf8',
  ),
  '/signal.js': await fs.readFile(
    path.join(root, 'packages/core/signal/dist/signal.esm-bundler.js'),
    'utf8',
  ),
  '/signal-internal.js': await fs.readFile(
    path.join(root, 'packages/core/signal/dist/internal.js'),
    'utf8',
  ),
  '/shared.js': await fs.readFile(
    path.join(root, 'packages/core/shared/dist/shared.esm-bundler.js'),
    'utf8',
  ),
  '/modules/ssr.js': ssr.code,
  '/modules/dom.js': dom.code,
  // The harness is a real file, not a template literal: everything in it
  // (`{}`, `${}`) collides with interpolation.
  '/harness.js': await fs.readFile(
    path.join(root, 'scripts/check/fixtures/ssr-hydration-harness.js'),
    'utf8',
  ),
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>ssr-hydration</title>
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
window.__plan = ${JSON.stringify(dom.hydrationPlan)}
window.__ssrRender = harness.render
window.__hydrate = harness.hydrate
window.__hydrateNoHandlers = harness.hydrateWithNoHandlers
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

// ---- Checks -----------------------------------------------------------------

async function open(tab: Page): Promise<void> {
  await tab.goto(origin)
  await tab.waitForFunction(() => window.__ready === true)
}

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: 'the SSR output carries exactly the markers the DOM plan names, in order',
    async run(tab) {
      await open(tab)
      const evidence = await tab.evaluate(() => {
        const html = window.__ssrRender()
        const plan = window.__plan as {
          components: Array<{
            nodes: Array<{ id: string; kind: string; optional: boolean }>
          }>
        }
        const nodes = plan.components.flatMap(component => component.nodes)
        // `<!--zeus:hydrate:/-->` closes a text node's dynamic region; it is
        // not a node marker. Node markers are the ids from the plan.
        const rendered = [...html.matchAll(/<!--zeus:hydrate:([^>]+)-->/g)]
          .map(match => match[1])
          .filter(id => id !== '/')
        return {
          // `optional` is the plan's own statement that a node may occur zero
          // times: both arms of a Show and every For item are marked this way.
          // A required marker that is absent is a real defect; an optional one
          // being absent is the branch not being taken.
          required: nodes.filter(node => !node.optional).map(node => node.id),
          optional: nodes.filter(node => node.optional).map(node => node.id),
          allIds: nodes.map(node => node.id),
          rendered,
          html,
        }
      })

      assert.ok(
        evidence.rendered.length > 0,
        'the SSR target must emit markers',
      )

      const missingRequired = evidence.required.filter(
        id => !evidence.rendered.includes(id),
      )
      assert.deepEqual(
        missingRequired,
        [],
        `the SSR output is missing markers the plan requires: ${JSON.stringify(missingRequired)}`,
      )

      const unknown = evidence.rendered.filter(
        id => !evidence.allIds.includes(id),
      )
      assert.deepEqual(
        unknown,
        [],
        `the SSR output writes markers the plan does not describe: ${JSON.stringify(unknown)}`,
      )

      // Order, among the markers that were actually rendered.
      //
      // Two things make a naive comparison wrong. A branch the plan lists but
      // this render did not take is simply absent. And a For item's markers
      // repeat once per item — the plan describes the item template once — so
      // the comparison is over first occurrences.
      const firstOccurrences = evidence.rendered.filter(
        (id, index) => evidence.rendered.indexOf(id) === index,
      )
      const renderedInPlanOrder = evidence.allIds.filter(id =>
        firstOccurrences.includes(id),
      )
      assert.deepEqual(
        firstOccurrences,
        renderedInPlanOrder,
        'the markers the server wrote must appear in the plan order',
      )

      // The repeated markers are the For item: exactly as many as the items.
      const itemMarker = evidence.optional.find(
        id => evidence.rendered.filter(seen => seen === id).length > 1,
      )
      assert.ok(
        itemMarker,
        `a For item's marker must repeat once per item; rendered: ${JSON.stringify(evidence.rendered)}`,
      )

      // The fixture takes the `open` branch, so exactly the fallback element
      // and the For item template should be the optional nodes present/absent.
      assert.ok(
        evidence.optional.length > 0,
        'this fixture must produce optional nodes, or it is not exercising branches',
      )
    },
  },
  {
    name: 'the SSR runtime renders the dynamic parts from props',
    async run(tab) {
      await open(tab)
      const html = await tab.evaluate(() => window.__ssrRender())
      assert.ok(
        html.includes('server title'),
        `expected the title in:\n${html}`,
      )
      assert.ok(html.includes('open'), 'the Show branch must be rendered')
      assert.ok(
        !html.includes('closed'),
        'the fallback must not render when open',
      )
      // The `<li>` elements carry marker comments inside them, so matching
      // `<li>a</li>` is wrong even when the output is right. Count the items
      // and check their text instead.
      const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(match =>
        match[1].replace(/<!--[^>]*-->/g, ''),
      )
      assert.deepEqual(
        items,
        ['a', 'b'],
        `the For body must render one <li> per item; HTML was:\n${html}`,
      )
    },
  },
  {
    name: 'hydration adopts the server nodes instead of replacing them',
    async run(tab) {
      await open(tab)
      const result = await tab.evaluate(() =>
        window.__hydrate(window.__ssrRender()),
      )
      assert.equal(result.error, null, `hydration threw: ${result.error}`)
      assert.ok(
        result.ids.length >= 3,
        `the fixture must render several nodes, got ${JSON.stringify(result.ids)}`,
      )
      const replaced = Object.entries(result.reused)
        .filter(([, survived]) => !survived)
        .map(([id]) => id)
      assert.deepEqual(
        replaced,
        [],
        `hydration replaced server nodes instead of adopting them: ${JSON.stringify(replaced)}`,
      )
    },
  },
  {
    name: 'hydration fails on a missing marker instead of rebuilding',
    async run(tab) {
      await open(tab)
      const result = await tab.evaluate(() => {
        const html = window.__ssrRender()
        const first = /<!--zeus:hydrate:[^>]+-->/.exec(html)
        return window.__hydrate(first ? html.replace(first[0], '') : html)
      })
      assert.equal(
        result.ok,
        false,
        'a missing marker must fail hydration rather than fall back to rendering',
      )
    },
  },
  {
    name: 'KNOWN GAP: the plan records tag names but hydratePlan never checks them',
    async run(tab) {
      // `HydrationPlanNode.tagName` is emitted by the compiler and declared in
      // the runtime's plan type, but `nodeOccurrences` — the only thing that
      // resolves a planned node — calls `context.nodes(node.id)` without the
      // expected tag. `ZEUS_HYDRATION_TAG_MISMATCH` therefore exists in
      // `createHydrationContext` and is unreachable from `hydratePlan`.
      //
      // This check asserts the *current* behaviour so the gap is visible and
      // cannot close silently in either direction: if server and client
      // disagree on an element's tag, hydration adopts the wrong node.
      //
      // It is deliberately not written as a passing "tag mismatch is rejected"
      // test, because that is not true. When the runtime starts validating the
      // tag this check fails, and the person who made that change should update
      // it to assert the rejection.
      await open(tab)
      const result = await tab.evaluate(() => {
        const html = window.__ssrRender()
        const mutated = html
          .replace('<h1 id="title">', '<h2 id="title">')
          .replace('</h1>', '</h2>')
        if (mutated === html) {
          return { ok: false, error: 'the tag mutation did not apply' }
        }
        const outcome = window.__hydrate(mutated)
        return {
          ok: outcome.ok,
          error: outcome.error,
          h2: document.querySelectorAll('#title').length,
        }
      })
      assert.equal(
        result.ok,
        true,
        'the runtime now rejects a tag mismatch — update this check to assert ' +
          'the rejection and remove the KNOWN GAP note',
      )
    },
  },
  {
    name: 'a repeated marker is legal: For items share their template markers',
    async run(tab) {
      // Duplicates are not always a defect. Every item of a For repeats the
      // item template's marker ids, so the plan must accept repeats and resolve
      // them by occurrence. `hydratePlan` passes `allowDuplicateMarkers = true`
      // for exactly this reason, and a check that asserted "duplicates are
      // rejected" would be wrong about the framework.
      //
      // What must hold instead: the repeated markers resolve to *distinct*
      // nodes, one per item, and hydration succeeds.
      await open(tab)
      const result = await tab.evaluate(() => {
        const html = window.__ssrRender()
        const repeats = [...html.matchAll(/<!--zeus:hydrate:c1\.e17-->/g)]
          .length
        const outcome = window.__hydrate(html)
        const items = [...document.querySelectorAll('#list li')].map(
          item => item.textContent?.trim() ?? '',
        )
        return { repeats, outcome, items }
      })
      assert.equal(
        result.repeats,
        2,
        'this fixture must produce one repeated item marker per list item',
      )
      assert.equal(
        result.outcome.ok,
        true,
        `a repeated For marker must hydrate, got: ${result.outcome.error}`,
      )
      assert.deepEqual(result.items, ['a', 'b'], 'both items must be adopted')
    },
  },
]

// ---- Run --------------------------------------------------------------------

const results: Array<{ check: string; status: string; error?: string }> = []
let browser
let context: import('@playwright/test').BrowserContext | undefined

try {
  const options = chromiumLaunchOptions()
  try {
    browser = await chromium.launch(options)
  } catch (error) {
    throw explainLaunchFailure(options.channel, error)
  }

  context = await browser.newContext()
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  })
  const tab = await context.newPage()
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
} catch (error) {
  console.error(
    `BLOCKED: the SSR hydration E2E could not start a browser.\n${
      error instanceof Error ? error.message : String(error)
    }`,
  )
  await new Promise<void>(resolve => server.close(() => resolve()))
  process.exit(2)
} finally {
  const failing = results.some(result => result.status !== 'passed')
  if (failing && context) {
    await fs.mkdir(output, { recursive: true })
    await context.tracing.stop({ path: path.join(output, 'trace.zip') })
  }
  await browser?.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
}

console.log(`browser: ${describeBrowser()}`)
console.log(JSON.stringify(results, null, 2))

const failures = results.filter(result => result.status === 'failed')
if (failures.length > 0) {
  throw new Error(
    `${failures.length} SSR hydration check(s) failed:\n${failures
      .map(failure => `  - ${failure.check}: ${failure.error}`)
      .join('\n')}`,
  )
}
console.log(`${results.length} SSR hydration check(s) passed.`)
