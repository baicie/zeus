/**
 * A DOM update does only the work it has to (TASK 13 / R21).
 *
 * `check:dom-update-browser` proves that untouched nodes keep their identity.
 * Identity is necessary and not sufficient: a framework could re-evaluate every
 * expression on every write, assign the same values back, and leave every node
 * object untouched. All of those identity assertions would pass.
 *
 * This check measures the other half: how many times each binding's expression
 * ran. Two independent signals feed two independent bindings, and writing one
 * must not re-run the other.
 *
 * ## How the count is taken
 *
 * The runtime's diagnostics session counts bindings *created*, not expressions
 * *executed*, so it cannot answer this question. The fixture counts its own
 * reads instead: each binding reads through a function that increments a
 * counter, and the counters live on the page. Zeus compiles one binding to one
 * effect that reads its signal, so "how many times was signal B read" is the
 * same question as "did the unrelated binding run".
 *
 * ## What is and is not claimed
 *
 * Effect executions are measured. A finer claim — that no sub-expression was
 * re-evaluated inside the effect that did run — is not visible from here and is
 * not claimed.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:dom-minimal-work-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:dom-minimal-work-browser
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
const output = path.join(root, 'temp/dom-minimal-work-browser')

/**
 * The page globals this check owns.
 *
 * The signal handle is named `__minimalSignals` rather than `__signals`
 * because `check-hydration-reactivity-browser.ts` augments the same `Window`
 * with a differently shaped `__signals`, and two augmentations of one property
 * must agree.
 */
declare global {
  interface Window {
    __reads: { a: number; b: number }
    __minimalSignals: {
      setA: (value: string) => void
      setB: (value: string) => void
    }
  }
}

interface CompilerOutput {
  code: string
  diagnostics: Array<{ code: string; message: string }>
}

/**
 * Two independent signals, each bound to one node, each read through a
 * counting function.
 */
const SOURCE = [
  "import { createSignal, render } from '@zeus-js/zeus'",
  '',
  'const counters = (window.__reads = { a: 0, b: 0 })',
  "const [a, setA] = createSignal('a0')",
  "const [b, setB] = createSignal('b0')",
  '',
  'function countedA() {',
  '  counters.a += 1',
  '  return a()',
  '}',
  '',
  'function countedB() {',
  '  counters.b += 1',
  '  return b()',
  '}',
  '',
  'function App() {',
  '  return (',
  '    <div id="root">',
  '      <p id="text">{countedA()}</p>',
  '      <div id="attr" title={countedB()}>b host</div>',
  '      <footer id="footer">static</footer>',
  '    </div>',
  '  )',
  '}',
  '',
  "render(App, document.getElementById('app'))",
  'window.__minimalSignals = { setA, setB }',
  '',
].join('\n')

function compile(): string {
  const compiler = require(
    path.join(root, 'packages/compiler/compiler/dist/compiler.cjs'),
  ) as { transformModule: (options: Record<string, unknown>) => CompilerOutput }
  const result = compiler.transformModule({
    source: SOURCE,
    filename: 'app.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
    hmr: false,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `the fixture must compile cleanly, got ${JSON.stringify(result.diagnostics)}`,
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
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>dom-minimal-work</title>
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
<script type="module" src="/fixture.js"></script>
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
  await tab.waitForFunction(
    () => document.getElementById('text')?.textContent === 'a0',
  )
}

const reads = (tab: Page) => tab.evaluate(() => ({ ...window.__reads }))

/**
 * Runs `body` and returns how many times each signal was read.
 *
 * The difference is taken on the page, in one evaluate, so a render that
 * happens between the two reads cannot be attributed to the wrong side.
 */
async function readsDuring(
  tab: Page,
  body: () => Promise<void>,
): Promise<{ a: number; b: number }> {
  const before = await reads(tab)
  await body()
  const after = await reads(tab)
  return { a: after.a - before.a, b: after.b - before.b }
}

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: 'writing signal A re-reads A and not B',
    async run(tab) {
      await open(tab)
      const delta = await readsDuring(tab, async () => {
        await tab.evaluate(() => window.__minimalSignals.setA('a1'))
        await tab.waitForFunction(
          () => document.getElementById('text')?.textContent === 'a1',
        )
      })
      assert.ok(
        delta.a >= 1,
        `A must be re-read when it changes, got ${delta.a}`,
      )
      assert.equal(
        delta.b,
        0,
        `writing A must not re-run the binding for B; got ${JSON.stringify(delta)}`,
      )
    },
  },
  {
    name: 'writing signal B re-reads B and not A',
    async run(tab) {
      await open(tab)
      const delta = await readsDuring(tab, async () => {
        await tab.evaluate(() => window.__minimalSignals.setB('b1'))
        await tab.waitForFunction(
          () => document.getElementById('attr')?.getAttribute('title') === 'b1',
        )
      })
      assert.ok(
        delta.b >= 1,
        `B must be re-read when it changes, got ${delta.b}`,
      )
      assert.equal(
        delta.a,
        0,
        `writing B must not re-run the binding for A; got ${JSON.stringify(delta)}`,
      )
    },
  },
  {
    name: 'a static node is never touched by an update',
    async run(tab) {
      await open(tab)
      const result = await tab.evaluate(async () => {
        const footer = document.getElementById('footer')
        const before = footer?.outerHTML
        window.__minimalSignals.setA('a2')
        window.__minimalSignals.setB('b2')
        await new Promise(resolve => requestAnimationFrame(resolve))
        return { before, after: document.getElementById('footer')?.outerHTML }
      })
      assert.equal(
        result.after,
        result.before,
        'a node with no binding must not be rewritten by an update',
      )
    },
  },
  {
    name: 'an unrelated DOM write does not cause a re-read',
    async run(tab) {
      await open(tab)
      // Touching the DOM outside the reactive graph must not wake any binding:
      // a framework that polls or re-renders on a timer would.
      const delta = await readsDuring(tab, async () => {
        await tab.evaluate(() => {
          const root = document.getElementById('root')
          root?.setAttribute('data-probe', '1')
        })
        await tab.waitForTimeout(100)
      })
      assert.deepEqual(
        delta,
        { a: 0, b: 0 },
        `an unrelated DOM write must not re-read any binding; got ${JSON.stringify(delta)}`,
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

reportAcrossEngines(outcomes, 'DOM minimal work')
await new Promise<void>(resolve => server.close(() => resolve()))
