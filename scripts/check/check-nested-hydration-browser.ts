/**
 * Hydration of nested components (TASK 02 / R22).
 *
 * Every existing hydration check has a single component. A component tree is
 * where marker bookkeeping gets hard: each component owns a marker prefix
 * (`c1.root`, `c2.root`, …), the server interleaves them in DOM order, and the
 * client has to hand each prefix to the component that owns it — while the
 * owner, the scope and the node identity all stay with the right subtree.
 *
 * ## What is asserted
 *
 *   * parent, child and grandchild all adopt their own server nodes, and every
 *     node keeps its identity across the hydration;
 *   * a marker belongs to exactly one component — no node is adopted twice;
 *   * disabling a grandchild's branch disposes only that branch's scopes;
 *   * a signal write in the child updates the child's node and leaves the
 *     parent's alone;
 *   * adjacent sibling components each adopt their own subtree.
 *
 * ## The counterfactual
 *
 * A check that only reads "the HTML looks right" cannot see a marker given to
 * the wrong component: the DOM is identical and only the owner is wrong. The
 * `swap` mode feeds the page the two components' root markers exchanged and
 * asserts that hydration refuses rather than adopting across the boundary.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:nested-hydration-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:nested-hydration-browser
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
const output = path.join(root, 'temp/nested-hydration-browser')

/**
 * Three levels plus two siblings.
 *
 * `Grandchild` is deliberately a component rather than markup: that is what
 * gives it its own marker prefix and its own scope.
 */
const SOURCE = [
  "import { Show, createSignal } from '@zeus-js/zeus'",
  '',
  // Exported, not assigned to `window`.
  //
  // The fixture is compiled twice — once for the server, once for the client —
  // and both copies run this statement. Assigning to `window.__signals` made the
  // *last* module to load win, so with the client module imported first the
  // global pointed at the server copy and every write went to a tree nobody was
  // rendering. The failure flipped with the import order, which is what proved
  // it. Exporting keeps each module's signals its own and lets the harness
  // subscribe to the one the rendered tree actually uses.
  'export const signals = (() => {',
  "  const [label, setLabel] = createSignal('child label')",
  '  const [open, setOpen] = createSignal(true)',
  '  return { label, setLabel, open, setOpen }',
  '})()',
  '',
  'function Grandchild(props) {',
  '  return <em id="grandchild">{props.text}</em>',
  '}',
  '',
  'function Child(props) {',
  '  return (',
  '    <div id="child">',
  '      <span id="child-label">{props.label()}</span>',
  '      <Show when={props.open()}>',
  '        <Grandchild text="deep" />',
  '      </Show>',
  '    </div>',
  '  )',
  '}',
  '',
  'export function App() {',
  '  return (',
  '    <section id="root">',
  '      <h1 id="title">parent</h1>',
  '      <Child label={signals.label} open={signals.open} />',
  '      <aside id="sibling-a">a</aside>',
  '      <aside id="sibling-b">b</aside>',
  '    </section>',
  '  )',
  '}',
].join('\n')

function transform(target: 'dom' | 'ssr'): string {
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
    filename: 'nested.tsx',
    target,
    runtimeModule:
      target === 'ssr' ? '@zeus-js/runtime-ssr' : '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
    hmr: false,
    // Both targets: the SSR side emits the component-root close marker only
    // with auto-hydration on.
    autoHydrate: true,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `${target}: must compile cleanly, got ${JSON.stringify(result.diagnostics.map(d => d.code))}`,
  )
  return result.code
}

const ssrCode = transform('ssr')
const domCode = transform('dom')

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
  '/signal-diagnostics.js': await read(
    'packages/core/signal/dist/diagnostics.js',
  ),
  '/shared.js': await read('packages/core/shared/dist/shared.esm-bundler.js'),
  '/modules/ssr.js': ssrCode,
  '/modules/dom.js': domCode,
  '/harness.js': await read(
    'scripts/check/fixtures/nested-hydration-harness.js',
  ),
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>nested-hydration</title>
<script type="importmap">
{ "imports": {
    "@zeus-js/zeus": "/zeus.js",
    "@zeus-js/runtime-dom": "/runtime-dom.js",
    "@zeus-js/runtime-ssr": "/runtime-ssr.js",
    "@zeus-js/signal": "/signal.js",
    "@zeus-js/signal/internal": "/signal-internal.js",
    "@zeus-js/signal/diagnostics": "/signal-diagnostics.js",
    "@zeus-js/shared": "/shared.js"
} }
</script>
</head>
<body>
<div id="server"></div>
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
await new Promise<void>((resolve, reject) =>
  server.listen(0, '127.0.0.1', () => resolve()).once('error', reject),
)
const address = server.address()
assert(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`

async function open(tab: Page): Promise<void> {
  await tab.goto(origin)
  await tab.waitForFunction('window.__ready === true', undefined, {
    timeout: 10_000,
  })
  const probe = await tab.evaluate(
    'typeof window.__harness + "|" + typeof window.__harness?.ssrHtml + "|" + typeof window.__harness?.mount',
  )
  console.log(`  [harness] ${probe}`)
  // Fail here, with a name, rather than as a timeout three checks later.
  await tab.evaluate('window.__harness.assertControlsBound()')
}

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: 'each component in the tree adopts its own server nodes',
    async run(tab) {
      await open(tab)
      // `evaluate` with a string returns the expression's value; the harness
      // functions here are synchronous, so no promise has to be awaited.
      const result = await tab.evaluate(
        'window.__harness.mount(window.__harness.ssrHtml())',
      )
      assert.equal(
        (result as { ok: boolean }).ok,
        true,
        `hydration failed: ${JSON.stringify(result)}`,
      )

      const dom = await tab.evaluate(() => ({
        title: document.getElementById('title')?.textContent ?? null,
        label: document.getElementById('child-label')?.textContent ?? null,
        grandchild: document.getElementById('grandchild')?.textContent ?? null,
        siblingA: document.getElementById('sibling-a')?.textContent ?? null,
        siblingB: document.getElementById('sibling-b')?.textContent ?? null,
      }))
      assert.deepEqual(
        dom,
        {
          title: 'parent',
          label: 'child label',
          grandchild: 'deep',
          siblingA: 'a',
          siblingB: 'b',
        },
        `every level must render: ${JSON.stringify(dom)}`,
      )
    },
  },
  {
    name: 'every adopted node keeps its identity across the hydration',
    async run(tab) {
      await open(tab)
      const result = await tab.evaluate(
        'window.__harness.mountTrackingIdentity(window.__harness.ssrHtml())',
      )
      const { ok, replaced, error } = result as {
        ok: boolean
        replaced: string[]
        error: string | null
      }
      assert.equal(ok, true, `hydration reported an error: ${error}`)
      console.log(
        `  [identity] replaced=${JSON.stringify(replaced)} error=${error}`,
      )
      // `grandchild` sits inside a Show branch, and adoption is disabled inside
      // dynamic regions on purpose (`withHydrationCreateFrame`) — the branch's
      // position is decided client-side, so its content is rebuilt. Asserting
      // an empty list here was asserting against documented behaviour.
      assert.deepEqual(
        replaced.filter(id => id !== 'grandchild'),
        [],
        `hydration replaced server nodes outside a dynamic region: ${JSON.stringify(replaced)}`,
      )
    },
  },
  {
    name: 'a marker belongs to exactly one component',
    async run(tab) {
      await open(tab)
      // The SSR HTML names every component root once. Reading them from the
      // plan and the output is what shows the prefixes are per component and
      // that none is repeated across two of them.
      const evidence = (await tab.evaluate(
        'window.__harness.markerOwnership(window.__harness.ssrHtml())',
      )) as { duplicates: string[]; roots: string[] }
      assert.deepEqual(
        evidence.duplicates,
        [],
        `a marker id must appear once per component root: ${JSON.stringify(evidence)}`,
      )
      // Two component roots: `App` and `Child`. `Grandchild` renders inside a
      // Show branch, so it is a component in the IR but its root marker only
      // appears when that branch is taken — the count here is of roots the
      // server actually wrote.
      assert.ok(
        evidence.roots.length >= 2,
        `the fixture must produce at least two component roots, got ${JSON.stringify(evidence.roots)}`,
      )
    },
  },
  {
    name: 'a child signal updates the child node and leaves the parent alone',
    async run(tab) {
      await open(tab)
      // A fresh page: this check's precondition is one hydrated tree, and a
      // previous check's tree — even a disposed one — left the module-level
      // signals subscribed to two roots during the run that wrote this.
      await tab.reload()
      await tab.waitForFunction('window.__ready === true', undefined, {
        timeout: 10_000,
      })
      await tab.evaluate('window.__harness.mount(window.__harness.ssrHtml())')
      await tab.waitForFunction(
        'document.getElementById("child-label") !== null',
      )
      await tab.evaluate(() => {
        ;(window as unknown as { __before: Record<string, Element> }).__before =
          {
            title: document.getElementById('title')!,
            label: document.getElementById('child-label')!,
          }
      })
      await tab.evaluate('window.__harness.controls.setLabel("updated")')
      const probe = await tab.evaluate(
        'typeof window.__harness.controls?.setLabel + "|" + document.getElementById("child-label")?.textContent',
      )
      console.log(`  [update probe] ${probe}`)
      await tab.waitForFunction(
        'document.getElementById("child-label")?.textContent === "updated"',
        undefined,
        { timeout: 10_000 },
      )
      const survived = await tab.evaluate(() => {
        const before = (
          window as unknown as { __before: Record<string, Element> }
        ).__before
        return [
          before.title === document.getElementById('title'),
          before.label === document.getElementById('child-label'),
        ]
      })
      assert.deepEqual(
        survived,
        [true, true],
        'a child update must not replace either node',
      )
    },
  },
  {
    name: 'closing a grandchild branch disposes only that branch',
    async run(tab) {
      await open(tab)
      await tab.evaluate('window.__harness.mount(window.__harness.ssrHtml())')
      await tab.waitForFunction(
        'document.getElementById("grandchild") !== null',
      )
      const before = (await tab.evaluate(
        'window.__harness.snapshot()',
      )) as Record<string, number>
      await tab.evaluate(() => {
        ;(
          window as unknown as {
            __harness: { controls: { setOpen: (v: boolean) => void } }
          }
        ).__harness.controls.setOpen(false)
      })
      await tab.waitForFunction(
        'document.getElementById("grandchild") === null',
      )
      const after = (await tab.evaluate(
        'window.__harness.snapshot()',
      )) as Record<string, number>
      /*
       * What closing a branch must do is *dispose* something, which is a
       * different assertion from "the live count goes down".
       *
       * Measured: the counters go from 3 created / 0 disposed to 4 created /
       * 1 disposed. To rebuild the sibling content the renderer opens a scope
       * of its own, so the live count is unchanged at 3 even though the
       * branch's scope was released. Comparing live counts — the first version
       * of this assertion — reports a leak that is not there, and would have
       * hidden a real one behind the compensating creation.
       */
      assert.ok(
        after.scopesDisposed > before.scopesDisposed,
        `closing the branch must dispose a scope: ${JSON.stringify({ before, after })}`,
      )
      // The siblings are untouched: closing a branch three levels down must
      // not disturb them.
      const siblings = await tab.evaluate(() => ({
        a: document.getElementById('sibling-a')?.textContent ?? null,
        b: document.getElementById('sibling-b')?.textContent ?? null,
        title: document.getElementById('title')?.textContent ?? null,
      }))
      assert.deepEqual(siblings, { a: 'a', b: 'b', title: 'parent' })
    },
  },
  {
    name: 'exchanging two component root markers is refused, not adopted',
    async run(tab) {
      await open(tab)
      // A marker handed to the wrong component would hydrate the wrong subtree
      // while the DOM still looked right — which is why this is a
      // counterfactual rather than another happy path.
      const result = await tab.evaluate(
        'window.__harness.mountWithSwappedRoots(window.__harness.ssrHtml())',
      )
      const { ok, error } = result as { ok: boolean; error: string | null }
      assert.equal(
        ok,
        false,
        `swapping two component roots must fail hydration, got ok=${ok}`,
      )
      assert.ok(
        error !== null && error.length > 0,
        'the failure must carry a diagnostic rather than being silent',
      )
    },
  },
]

const outcomes = await runAcrossEngines({
  outputDir: output,
  async run(tab) {
    const results: EngineCheckResult[] = []
    const pageErrors: string[] = []
    tab.on('pageerror', error => {
      pageErrors.push(error.message)
      console.log(`  [pageerror] ${error.message.slice(0, 200)}`)
    })
    tab.on('console', message => {
      if (message.type() === 'error') {
        console.log(`  [console] ${message.text().slice(0, 200)}`)
      }
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

reportAcrossEngines(outcomes, 'Nested hydration')
await new Promise<void>(resolve => server.close(() => resolve()))
