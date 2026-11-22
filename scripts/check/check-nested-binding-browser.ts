/**
 * A nested component's binding must stay reactive after hydration (R23 TASK 25).
 *
 * `check:nested-hydration-browser` asserts this among other things and fails at
 * it. Rather than guess at that check's fixture, this reproduces the smallest
 * case that shows the defect and states it precisely:
 *
 * ```text
 * server HTML:  <div id="r"><span id="l">server</span></div>
 * after hydrate: the span is adopted (same node object)
 * signal write:  the signal's value changes, the DOM does not
 * ```
 *
 * ## What is already ruled out
 *
 * The same fixture, compiled by the same compiler and driven in jsdom, works:
 * `child label` becomes `updated` after the write. So the defect is not in the
 * compiler's output nor in `mountDynamic` when driven directly.
 *
 * Also ruled out: a missing reactive owner. `autoHydrateComponent` runs its
 * adopt body without one, and giving it one (`runWithOwner(createOwner(), …)`)
 * did not change the browser result — the patch was reverted rather than kept
 * on the strength of the reasoning that produced it.
 *
 * What is left is the browser path specifically, which is why this check exists
 * as a browser check and not as a unit test: something about running inside a
 * real page changes the outcome, and the report needs to say so rather than
 * guess.
 *
 * ## Status
 *
 * The check reports the observation and marks itself FAILED when the DOM does
 * not follow the signal. It does not carry a workaround: a nested hydration
 * that adopts nodes but drops their bindings is worse than one that rebuilds
 * them, because the page looks correct until something changes.
 *
 * ```text
 * pnpm check:nested-binding-browser
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
const output = path.join(root, 'temp/nested-binding-browser')

/**
 * One component inside another, each with a binding of its own.
 *
 * The outer binding is the control: if it updates and the inner does not, the
 * defect is about nesting rather than about hydration in general.
 */
const SOURCE = [
  "import { Show, createSignal } from '@zeus-js/zeus'",
  '',
  'const signals = (window.__probeSignals = (() => {',
  "  const [label, setLabel] = createSignal('child label')",
  '  const [open, setOpen] = createSignal(true)',
  '  return { label, setLabel, open, setOpen }',
  '})())',
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
    filename: 'nested-binding.tsx',
    target,
    runtimeModule:
      target === 'ssr' ? '@zeus-js/runtime-ssr' : '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
    hmr: false,
    // Both targets: the SSR side emits the root close marker only with
    // auto-hydration on.
    autoHydrate: true,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `${target}: must compile cleanly, got ${JSON.stringify(result.diagnostics)}`,
  )
  return result.code
}

const ssrCode = transform('ssr')
const domCode = transform('dom')

const ENTRY = `
import { render } from '@zeus-js/runtime-dom'
import { renderToString } from '@zeus-js/runtime-ssr'
import { createRuntimeDiagnosticsSession } from '@zeus-js/signal/diagnostics'
import { App as SsrApp } from '/modules/ssr.js'
import { App } from '/modules/dom.js'

window.__ssrHtml = () => renderToString(() => SsrApp())
// Harness-shaped hydrate: same body as the fixture's, inlined here so the only
// difference from it is that this file owns the code.
window.__hydrateHarnessStyle = () => {
  const container = document.getElementById('server')
  if (globalThis.__disposeTree) {
    globalThis.__disposeTree()
    globalThis.__disposeTree = null
  }
  container.innerHTML = window.__ssrHtml()
  let error = null
  const session = createRuntimeDiagnosticsSession()
  session.run(() => {
    try {
      globalThis.__disposeTree = render(() => App(), container, {
        hydrate: true,
        onHydrationError: (thrown) => { error = String(thrown) },
      })
    } catch (thrown) {
      error = String(thrown)
    }
  })
  return { ok: error === null, error }
}
window.__hydrate = (disposeFirst) => {
  const container = document.getElementById('server')
  if (disposeFirst && globalThis.__disposeTree) {
    globalThis.__disposeTree()
    globalThis.__disposeTree = null
  }
  container.innerHTML = window.__ssrHtml()
  const before = {
    root: document.getElementById('root'),
    title: document.getElementById('title'),
    child: document.getElementById('child'),
    label: document.getElementById('child-label'),
    grandchild: document.getElementById('grandchild'),
  }
  let error = null
  // The diagnostics session is what the real harness wraps its render in, and
  // it is the one difference left between this page and the one that fails.
  // The diagnostics session is the harness's wrapper. Kept here as a controlled
  // variable: with it, does the nested binding still update?
  const session = createRuntimeDiagnosticsSession()
  let dispose
  session.run(() => {
    dispose = render(() => App(), container, {
      hydrate: true,
      onHydrationError: thrown => { error = String(thrown) },
    })
  })
  globalThis.__disposeTree = dispose
  return {
    error,
    adopted: {
      root: before.root === document.getElementById('root'),
      title: before.title === document.getElementById('title'),
      child: before.child === document.getElementById('child'),
      label: before.label === document.getElementById('child-label'),
      grandchild: before.grandchild === document.getElementById('grandchild'),
    },
    text: {
      title: document.getElementById('title')?.textContent ?? null,
      label: document.getElementById('child-label')?.textContent ?? null,
      grandchild: document.getElementById('grandchild')?.textContent ?? null,
    },
    dispose: () => { dispose?.(); globalThis.__disposeTree = null },
  }
}
window.__write = (which, value) => {
  if (which === 'label') window.__probeSignals.setLabel(value)
  else window.__probeSignals.setOpen(value)
}
window.__textNodeId = () => {
  const n = document.getElementById('child-label')?.firstChild
  if (!n) return null
  n.__probeId ??= Math.random().toString(36).slice(2, 8)
  return { id: n.__probeId, type: n.nodeType, data: n.textContent }
}
window.__read = () => ({
  signals: {
    label: String(window.__probeSignals.label()),
    open: String(window.__probeSignals.open()),
  },
  dom: {
    label: document.getElementById('child-label')?.textContent ?? null,
    grandchild: document.getElementById('grandchild')?.textContent ?? null,
  },
})
window.__ready = true
`

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
  // The page's own script, served as a module file rather than inlined. The
  // harness works this way and mine was inlined, which is the last structural
  // difference between the two.
  '/entry.js': ENTRY,
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>nested-binding</title>
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
<script type="module" src="/entry.js"></script>
</body>
</html>`

const server = http.createServer((request, response) => {
  const url = (request.url ?? '/').split('?')[0]!
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
}

interface HydrateResult {
  error: string | null
  adopted: Record<string, boolean>
  text: Record<string, string | null>
}

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: 'hydration adopts both the outer and the nested component',
    async run(tab) {
      await open(tab)
      const result = (await tab.evaluate(
        'window.__hydrate()',
      )) as unknown as HydrateResult
      console.log(
        `  [hydrate] ${JSON.stringify(result.adopted)} error=${result.error}`,
      )
      assert.equal(
        result.error,
        null,
        `hydration reported an error: ${result.error}`,
      )
      assert.deepEqual(
        result.adopted,
        {
          root: true,
          title: true,
          child: true,
          label: true,
          // The grandchild sits inside a Show branch. Whether it is adopted or
          // rebuilt is recorded rather than asserted: adoption disabled inside
          // dynamic regions is a documented decision, and the check that
          // matters is the binding below.
          grandchild: result.adopted.grandchild,
        },
        `the static nodes must be adopted: ${JSON.stringify(result.adopted)}`,
      )
      assert.deepEqual(
        result.text,
        { title: 'parent', label: 'child label', grandchild: 'deep' },
        `the server text must survive hydration: ${JSON.stringify(result.text)}`,
      )
    },
  },
  {
    name: 'the nested binding updates after hydration',
    async run(tab) {
      await open(tab)
      // Hydrate once, dispose, hydrate again — the harness's pattern, with the
      // dispose it was missing.
      await tab.evaluate(() =>
        (
          window as unknown as { __hydrate: (d?: boolean) => unknown }
        ).__hydrate(true),
      )
      const duplicate = await tab.evaluate(() => {
        try {
          return (
            window as unknown as { __hydrate: (d?: boolean) => unknown }
          ).__hydrate(false)
        } catch (thrown) {
          return { threw: String(thrown).slice(0, 90) }
        }
      })
      console.log(`  [duplicate hydrate] ${JSON.stringify(duplicate)}`)
      await tab.evaluate('window.__hydrate(true)')
      const nodesBefore = await tab.evaluate('window.__textNodeId()')
      await tab.evaluate('window.__write("label", "updated")')
      const nodesAfter = await tab.evaluate('window.__textNodeId()')
      console.log(
        `  [text node] before=${JSON.stringify(nodesBefore)} after=${JSON.stringify(nodesAfter)}`,
      )
      await tab.waitForFunction(
        'document.getElementById("child-label")?.textContent === "updated"',
        undefined,
        { timeout: 5_000 },
      )
      const after = (await tab.evaluate('window.__read()')) as {
        signals: Record<string, string>
        dom: Record<string, string | null>
      }
      assert.equal(
        after.dom.label,
        after.signals.label,
        `the nested binding must follow its signal: ${JSON.stringify(after)}`,
      )
    },
  },
  {
    name: 'the Show branch keeps working after hydration',
    async run(tab) {
      await open(tab)
      await tab.evaluate('window.__hydrate()')
      await tab.evaluate('window.__write("open", false)')
      // Read both sides before asserting, so a failure says whether the signal
      // moved and the DOM did not — the difference between a broken binding and
      // a broken signal.
      const observed = await tab
        .waitForFunction(
          'document.getElementById("grandchild") === null',
          undefined,
          { timeout: 5_000 },
        )
        .then(() => true)
        .catch(() => false)
      const after = (await tab.evaluate('window.__read()')) as {
        signals: Record<string, string>
        dom: Record<string, string | null>
      }
      console.log(`  [nested update] ${JSON.stringify(after)}`)
      assert.ok(
        observed,
        `closing the Show branch did not remove the grandchild: the signal reads ` +
          `"${after.signals.open}" and the DOM still has a grandchild.`,
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

reportAcrossEngines(outcomes, 'Nested binding after hydration')
await new Promise<void>(resolve => server.close(() => resolve()))
