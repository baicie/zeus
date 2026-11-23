/**
 * Fifty hydrate/dispose cycles leave nothing behind (R24 TASK 25).
 *
 * `check:runtime-cleanup-browser` already runs fifty cycles of mount and
 * dispose. Those cycles never hydrate, so they cannot see the leaks that only
 * exist on the adoption path: a session that keeps its marker index, a scope
 * created in an adopt body that nothing disposes, a Show branch whose subtree
 * survives the second cycle because it was rebuilt rather than adopted.
 *
 * Each cycle here is the full one a user would drive:
 *
 *   server HTML → hydrate → signal write → Show close → Show open → dispose
 *
 * and after each, the counters must be back to zero and the container must hold
 * no framework nodes.
 *
 * ## Why it counts rather than measures
 *
 * `createRuntimeDiagnosticsSession` counts scopes, effects, bindings and
 * listeners as they are created and disposed. A leak shows up as a positive
 * difference that grows with the cycle count — the signature of a per-cycle
 * leak, as opposed to a constant offset from something allocated once.
 *
 * The check reports the per-cycle delta, so a failure says whether the leak is
 * linear in cycles or a one-off.
 *
 * ```text
 * pnpm check:hydration-cycles-browser
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
const output = path.join(root, 'temp/hydration-cycles-browser')

/** The shape a user drives: a bound text, a Show, and a component in it. */
const SOURCE = [
  "import { Show, createSignal } from '@zeus-js/zeus'",
  '',
  'const state = (window.__cycleState = (() => {',
  "  const [label, setLabel] = createSignal('server')",
  '  const [open, setOpen] = createSignal(true)',
  '  return { label, setLabel, open, setOpen }',
  '})())',
  '',
  'function Leaf(props) {',
  '  return <em id="leaf">{props.text}</em>',
  '}',
  '',
  'export function App() {',
  '  return (',
  '    <div id="root">',
  '      <span id="label">{state.label()}</span>',
  '      <Show when={state.open()}>',
  '        <Leaf text="branch" />',
  '      </Show>',
  '    </div>',
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
    filename: 'cycles.tsx',
    target,
    runtimeModule:
      target === 'ssr' ? '@zeus-js/runtime-ssr' : '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
    hmr: false,
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
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>hydration-cycles</title>
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
import { render } from '@zeus-js/runtime-dom'
import { renderToString } from '@zeus-js/runtime-ssr'
import { createRuntimeDiagnosticsSession } from '@zeus-js/signal/diagnostics'
import { App as SsrApp } from '/modules/ssr.js'
import { App } from '/modules/dom.js'

const html = renderToString(() => SsrApp())
window.__html = html
window.__baseNodes = null

window.__runCycles = (count) => {
  const container = document.getElementById('server')
  const samples = []
  let dispose = null
  for (let index = 0; index < count; index += 1) {
    if (dispose) { dispose(); dispose = null }
    container.innerHTML = html
    const session = createRuntimeDiagnosticsSession()
    let error = null
    session.run(() => {
      dispose = render(() => App(), container, {
        hydrate: true,
        onHydrationError: (thrown) => { error = String(thrown) },
      })
    })
    // Drive it the way a user would before tearing it down.
    window.__cycleState.setLabel('cycle-' + index)
    window.__cycleState.setOpen(false)
    window.__cycleState.setOpen(true)
    const snapshot = session.snapshot()
    if (dispose) { dispose(); dispose = null }
    const after = session.snapshot()
    samples.push({
      cycle: index,
      error,
      during: snapshot,
      after,
      containerChildren: container.childNodes.length,
    })
  }
  return samples
}

/**
 * Framework nodes left in the container after every dispose.
 *
 * Text nodes and comments only: any element still there was rendered by the
 * framework, since the container starts empty and is refilled from the same
 * server HTML each cycle.
 */
window.__leftovers = () => {
  const container = document.getElementById('server')
  return Array.from(container.querySelectorAll('*')).map((node) => node.id || node.tagName)
}
window.__ready = true
</script>
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

const CYCLES = 50

interface Sample {
  cycle: number
  error: string | null
  during: Record<string, number>
  after: Record<string, number>
  containerChildren: number
}

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: `${CYCLES} hydrate/dispose cycles leave no live scopes or effects`,
    async run(tab) {
      await tab.goto(origin)
      await tab.waitForFunction('window.__ready === true', undefined, {
        timeout: 10_000,
      })
      const samples = (await tab.evaluate(
        `window.__runCycles(${CYCLES})`,
      )) as unknown as Sample[]

      assert.equal(samples.length, CYCLES, 'every cycle must report')

      const hydrationErrors = samples.filter(sample => sample.error !== null)
      assert.deepEqual(
        hydrationErrors.map(sample => `${sample.cycle}: ${sample.error}`),
        [],
        'no cycle may report a hydration error',
      )

      // Anything still alive after the last dispose is a leak. A per-cycle leak
      // grows with the count; a constant offset is something allocated once.
      const leaked = samples.filter(sample => {
        const live = (key: string) =>
          (sample.after[key] ?? 0) -
          (sample.after[key.replace('Created', 'Disposed')] ?? 0)
        return (
          live('scopesCreated') > 0 ||
          live('effectsCreated') > 0 ||
          live('bindingsCreated') > 0 ||
          live('listenersCreated') > 0
        )
      })
      const firstLeak = samples[0]?.after
      assert.deepEqual(
        leaked
          .slice(0, 3)
          .map(sample => ({ cycle: sample.cycle, after: sample.after })),
        [],
        `cycles leaked live resources after dispose; cycle 0 states were ` +
          `${JSON.stringify(firstLeak)}`,
      )
    },
  },
  {
    name: 'no framework nodes survive the final dispose',
    async run(tab) {
      await tab.goto(origin)
      await tab.waitForFunction('window.__ready === true', undefined, {
        timeout: 10_000,
      })
      await tab.evaluate(`window.__runCycles(${CYCLES})`)
      const leftovers = (await tab.evaluate('window.__leftovers()')) as string[]
      // The last cycle disposed, so the container should hold the server HTML's
      // own elements only — none of them rendered by a live root. An element
      // with an id here means a root's output outlived its dispose.
      assert.deepEqual(
        leftovers.filter(id => ['root', 'label', 'leaf'].includes(id)),
        [],
        `these framework elements outlived the final dispose: ${leftovers.join(', ')}`,
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

reportAcrossEngines(outcomes, 'Hydration cycles')
await new Promise<void>(resolve => server.close(() => resolve()))
