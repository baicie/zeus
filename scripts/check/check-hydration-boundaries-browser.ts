/**
 * Hydration marker boundaries (TASK 07 / R21).
 *
 * Marker-based hydration has one class of bug that no happy-path test reaches:
 * the marker bookkeeping itself. A text node closed by `<!--zeus:hydrate:/-->`
 * with no open marker before it, two adjacent dynamic texts sharing a close, an
 * empty For leaving an unmatched region — each produces HTML that looks fine and
 * a tree the client cannot walk.
 *
 * `indexMarkers` has a specific rule for this: a close marker whose previous
 * sibling is also a marker means "the server rendered an empty value, so there
 * is no text node", and it inserts one. That rule is what these cases exercise.
 *
 * ## Why the fixtures come from the compiler
 *
 * Hand-writing marker sequences would test the rule against my guess of what
 * SSR emits. Every case below is compiled for both targets by the real
 * compiler, so the markers are the ones an application actually gets. This
 * distinction mattered while writing it: an early hand-written probe omitted
 * the open marker and made an empty text look like a defect.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:hydration-boundaries-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:hydration-boundaries-browser
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
const output = path.join(root, 'temp/hydration-boundaries-browser')

interface CompilerOutput {
  code: string
  diagnostics: Array<{ code: string; message: string }>
}

/**
 * The edge cases, each a complete module.
 *
 * `id` names the container element so the check can assert what rendered.
 */
const CASES = {
  /** `{''}` — the server writes an open marker, nothing, then a close. */
  'empty-text': [
    'export const App = () => (',
    '  <p id="q">{\'\'}</p>',
    ')',
  ].join('\n'),

  /** Two dynamic children adjacent to each other. */
  'adjacent-text': [
    'export const App = (props) => (',
    '  <p id="q">{props.a}{props.b}</p>',
    ')',
  ].join('\n'),

  /** Whitespace is text, not emptiness. */
  'whitespace-text': [
    'export const App = () => (',
    '  <p id="q">{\'   \'}</p>',
    ')',
  ].join('\n'),

  /** An empty list: the For region has no items to emit. */
  'empty-for': [
    "import { For } from '@zeus-js/zeus'",
    'export const App = () => (',
    '  <ul id="l"><For each={[]}>{item => <li>{item}</li>}</For></ul>',
    ')',
  ].join('\n'),

  /** A comment in the middle of the tree, which must not be read as a marker. */
  'stray-comment': [
    'export const App = (props) => (',
    '  <div id="d">',
    '    {props.a}',
    '    {/* a JSX comment becomes an ordinary comment node */}',
    '    {props.b}',
    '  </div>',
    ')',
  ].join('\n'),
} as const

type CaseName = keyof typeof CASES

function transform(
  name: string,
  source: string,
  target: 'dom' | 'ssr',
): CompilerOutput {
  const compiler = require(
    path.join(root, 'packages/compiler/compiler/dist/compiler.cjs'),
  ) as { transformModule: (options: Record<string, unknown>) => CompilerOutput }
  const result = compiler.transformModule({
    source,
    filename: `${name}.tsx`,
    target,
    runtimeModule:
      target === 'ssr' ? '@zeus-js/runtime-ssr' : '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: false,
    hmr: false,
    // Both targets need it: the SSR side emits the component-root close marker
    // only when auto-hydration is on.
    autoHydrate: true,
  })
  assert.equal(
    result.diagnostics.length,
    0,
    `${name} (${target}): must compile cleanly, got ${JSON.stringify(result.diagnostics)}`,
  )
  return result
}

const PROPS = { a: 'A', b: 'B' }

const modules: Record<string, string> = {}
for (const [name, source] of Object.entries(CASES)) {
  modules[`/modules/${name}.ssr.js`] = transform(name, source, 'ssr').code
  modules[`/modules/${name}.dom.js`] = transform(name, source, 'dom').code
}

const read = (relative: string) =>
  fs.readFile(path.join(root, relative), 'utf8')

Object.assign(modules, {
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
  '/props.js': `export const PROPS = ${JSON.stringify(PROPS)}\n`,
  '/harness.js': await read(
    'scripts/check/fixtures/hydration-boundaries-harness.js',
  ),
  '/cases.js': `export const CASE_NAMES = ${JSON.stringify(Object.keys(CASES))}\n`,
})

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>hydration-boundaries</title>
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
window.__runCase = harness.run
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
  await tab.waitForFunction(
    () => (window as unknown as { __ready?: boolean }).__ready === true,
  )
}

type CaseOutcome = {
  ok: boolean
  error: string | null
  html: string
  rendered: string
  text: string
  orphanClose: boolean
}

const runCase = (tab: Page, name: CaseName) =>
  tab.evaluate(
    caseName =>
      (
        window as unknown as {
          __runCase: (name: string) => Promise<CaseOutcome>
        }
      ).__runCase(caseName),
    name as string,
  )

const checks: Array<{ name: string; run: (tab: Page) => Promise<void> }> = [
  {
    name: 'an empty dynamic text hydrates and stays empty',
    async run(tab) {
      await open(tab)
      const outcome = await runCase(tab, 'empty-text')
      assert.equal(outcome.ok, true, `hydration failed: ${outcome.error}`)
      assert.equal(outcome.text, '', 'an empty text must stay empty')
      assert.equal(
        outcome.orphanClose,
        false,
        `the close marker must have an open marker before it:\n${outcome.html}`,
      )
    },
  },
  {
    name: 'two adjacent dynamic texts both survive with their own content',
    async run(tab) {
      await open(tab)
      const outcome = await runCase(tab, 'adjacent-text')
      assert.equal(outcome.ok, true, `hydration failed: ${outcome.error}`)
      assert.equal(
        outcome.text,
        'AB',
        `both values must be present in order, got ${JSON.stringify(outcome.text)}`,
      )
    },
  },
  {
    name: 'whitespace is text, not emptiness',
    async run(tab) {
      await open(tab)
      const outcome = await runCase(tab, 'whitespace-text')
      assert.equal(outcome.ok, true, `hydration failed: ${outcome.error}`)
      assert.equal(
        outcome.text,
        '   ',
        `whitespace must be preserved, got ${JSON.stringify(outcome.text)}`,
      )
    },
  },
  {
    name: 'an empty For hydrates without leaving an unmatched region',
    async run(tab) {
      await open(tab)
      const outcome = await runCase(tab, 'empty-for')
      assert.equal(outcome.ok, true, `hydration failed: ${outcome.error}`)
      assert.equal(outcome.text, '', 'an empty list must render no items')
      assert.ok(
        !outcome.rendered.includes('<li'),
        `no item element may survive:\n${outcome.rendered}`,
      )
    },
  },
  {
    name: 'an ordinary comment between two texts is not read as a marker',
    async run(tab) {
      await open(tab)
      const outcome = await runCase(tab, 'stray-comment')
      assert.equal(outcome.ok, true, `hydration failed: ${outcome.error}`)
      assert.equal(
        outcome.text?.trim() ?? '',
        'AB',
        `the comment must not displace either text, got ${JSON.stringify(outcome.text)}`,
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

reportAcrossEngines(outcomes, 'Hydration boundaries')
await new Promise<void>(resolve => server.close(() => resolve()))
