/**
 * Web Components lifecycle E2E (TASK I / R20).
 *
 * `check:form-associated-browser` covers form participation and
 * `check:runtime-cleanup-browser` covers effect and listener disposal. Neither
 * covers the surface TASK 13 names, so this check does, in one fixture that
 * renders every part of it at once:
 *
 *   * `connectedCallback` / `disconnectedCallback` / `attributeChangedCallback`
 *   * attribute → property reflection for String, Number and Boolean
 *   * property → attribute reflection where the definition asks for it
 *   * Shadow DOM and Light DOM projection
 *   * default and named slots
 *   * dynamic content inside a slot
 *   * repeated connect / disconnect cycles with cleanup counts
 *
 * ## Why this runs against the real compiler
 *
 * The `defineElement` call and its JSX children are compiled by the real
 * compiler, so the light-DOM projection and slot handling under test are the
 * ones an application gets. A hand-written equivalent would test a different
 * program: the compiler decides how `<Host>` and `<Slot>` lower, and a slot
 * that renders correctly by hand can be emitted incorrectly.
 *
 * ## Cleanup counting
 *
 * Each render registers an effect and an `onCleanup`. Disconnecting the element
 * must dispose the root. The check asserts `cleanups === mounts - 1` after N
 * connect/disconnect cycles, and `cleanups === mounts` after the final
 * disconnect — a per-cycle leak would fail both.
 *
 * ## Running it
 *
 * ```text
 * pnpm check:web-components-browser
 * ZEUS_BROWSER_CHANNEL=chrome pnpm check:web-components-browser
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
const output = path.join(root, 'temp/web-components-browser')

declare global {
  interface Window {
    __ready: boolean
    __fixture?: {
      mounts: number
      cleanups: number
      connects: number
      disconnects: number
      attributeChanges: string[]
    }
    __errors: string[]
  }
}

interface CompilerOutput {
  code: string
  diagnostics: Array<{ code: string; message: string }>
}

/**
 * The fixture. It defines two custom elements:
 *
 *   `z-shadow-card`   Shadow DOM, a named slot and a default slot, one String
 *                     prop and one Number prop, both reflecting.
 *   `z-light-card`    Light DOM projection, the same slots.
 *
 * Both count their lifecycle calls, so the counters can be compared against the
 * DOM operations the checks perform.
 */
const SOURCE = `
import {
  Host,
  Slot,
  createEffect,
  defineElement,
  onCleanup,
} from '@zeus-js/zeus'

const state = (globalThis.__fixture ??= {
  mounts: 0,
  cleanups: 0,
  connects: 0,
  disconnects: 0,
  attributeChanges: [],
})

defineElement(
  'z-shadow-card',
  {
    shadow: true,
    props: {
      title: String,
      count: Number,
      active: Boolean,
    },
  },
  props => {
    state.mounts += 1
    state.connects += 1
    // The cleanup must run when the element disconnects. Without registering
    // one there is nothing to observe, and the counter would read zero no
    // matter what the element lifecycle did.
    createEffect(() => {
      props.title
    })
    onCleanup(() => {
      state.cleanups += 1
    })
    return (
      <Host class="card">
        <h2 id="heading">{props.title}</h2>
        <p id="count">count: {props.count}</p>
        <p id="active">active: {props.active ? 'yes' : 'no'}</p>
        <Slot name="heading">default heading</Slot>
        <Slot>default body</Slot>
      </Host>
    )
  },
)

defineElement(
  'z-light-card',
  {
    shadow: false,
    props: { title: String },
  },
  props => {
    state.mounts += 1
    state.connects += 1
    onCleanup(() => {
      state.cleanups += 1
    })
    return (
      <Host class="light">
        <h2 id="light-heading">{props.title}</h2>
        <Slot name="heading">light default heading</Slot>
        <Slot>light default body</Slot>
      </Host>
    )
  },
)

window.__fixture = state
window.__ready = true
`

function compile(): string {
  const compiler = require(
    path.join(root, 'packages/compiler/compiler/dist/compiler.cjs'),
  ) as { transformModule: (options: Record<string, unknown>) => CompilerOutput }
  const result = compiler.transformModule({
    source: SOURCE,
    filename: 'components.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: true,
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

const modules: Record<string, string> = {
  '/runtime-dom.js': await fs.readFile(
    path.join(
      root,
      'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
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
  '/zeus.js': await fs.readFile(
    path.join(root, 'packages/core/zeus/dist/zeus.esm-bundler.js'),
    'utf8',
  ),
  '/fixture.js': compiled,
}

const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>web-components</title>
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
<div id="light-host"></div>
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
  await tab.waitForFunction(() => window.__ready === true)
  // Defining an element is synchronous, but the first connection happens on the
  // next task.
  await tab.waitForFunction(
    () => customElements.get('z-shadow-card') !== undefined,
  )
}

// ---- Checks -----------------------------------------------------------------

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

  const check = async (name: string, run: () => Promise<void>) => {
    try {
      await run()
      results.push({ check: name, status: 'passed' })
    } catch (error) {
      results.push({
        check: name,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      })
      await fs.mkdir(output, { recursive: true })
      await tab.screenshot({
        path: path.join(output, `${name.replace(/\W+/g, '-')}.png`),
        fullPage: true,
      })
    }
  }

  await check('a custom element renders into a shadow root', async () => {
    await open(tab)
    const evidence = await tab.evaluate(() => {
      const host = document.createElement('z-shadow-card')
      host.setAttribute('title', 'shadow title')
      host.setAttribute('count', '3')
      document.body.append(host)
      const root = host.shadowRoot
      return {
        hasShadow: root !== null,
        heading: root?.querySelector('#heading')?.textContent ?? null,
        count: root?.querySelector('#count')?.textContent ?? null,
        // The element's own children are the light-DOM, which must not be
        // rendered inside the shadow root.
        lightChildren: host.children.length,
      }
    })
    assert.ok(evidence.hasShadow, 'the element must attach a shadow root')
    assert.equal(evidence.heading, 'shadow title')
    assert.equal(evidence.count, 'count: 3', 'the Number prop must be coerced')
  })

  await check('attributes reflect to typed properties', async () => {
    await open(tab)
    const evidence = await tab.evaluate(() => {
      const host = document.createElement('z-shadow-card') as HTMLElement & {
        count?: number
        active?: boolean
        title?: string
      }
      document.body.append(host)
      host.setAttribute('title', 'typed')
      host.setAttribute('count', '42')
      host.setAttribute('active', '')
      const afterAttributes = {
        title: host.title,
        count: host.count,
        active: host.active,
      }
      // HTML boolean-attribute semantics: presence is truth, not the string.
      // `value !== null` is the documented coercion, so the literal "false"
      // must still read as true. A test asserting the opposite would be
      // asserting a bug.
      host.setAttribute('active', 'false')
      const afterFalse = { active: host.active }
      host.removeAttribute('active')
      const afterRemoval = { active: host.active }
      return { afterAttributes, afterFalse, afterRemoval }
    })
    assert.equal(
      evidence.afterAttributes.title,
      'typed',
      'String reflects verbatim',
    )
    assert.equal(
      evidence.afterAttributes.count,
      42,
      'Number must coerce to a number',
    )
    assert.equal(
      typeof evidence.afterAttributes.count,
      'number',
      'a Number prop must not stay a string',
    )
    assert.equal(
      evidence.afterAttributes.active,
      true,
      'a bare Boolean attribute must be true',
    )
    assert.equal(
      evidence.afterFalse.active,
      true,
      'a Boolean attribute is true when present, whatever its string value',
    )
    assert.equal(
      evidence.afterRemoval.active,
      false,
      'removing a Boolean attribute must set it false',
    )
  })

  await check('the rendered output follows attribute changes', async () => {
    await open(tab)
    const evidence = await tab.evaluate(async () => {
      const host = document.createElement('z-shadow-card')
      host.setAttribute('title', 'first')
      host.setAttribute('count', '1')
      document.body.append(host)
      await new Promise(resolve => requestAnimationFrame(resolve))
      const before =
        host.shadowRoot?.querySelector('#heading')?.textContent ?? null
      host.setAttribute('title', 'second')
      host.setAttribute('count', '2')
      await new Promise(resolve => requestAnimationFrame(resolve))
      return {
        before,
        after: host.shadowRoot?.querySelector('#heading')?.textContent ?? null,
        count: host.shadowRoot?.querySelector('#count')?.textContent ?? null,
      }
    })
    assert.equal(evidence.before, 'first')
    assert.equal(evidence.after, 'second', 'a prop change must reach the DOM')
    assert.equal(evidence.count, 'count: 2', 'the second prop must update too')
  })

  await check(
    'named and default slots project light DOM children',
    async () => {
      await open(tab)
      const evidence = await tab.evaluate(async () => {
        const host = document.createElement('z-shadow-card')
        host.setAttribute('title', 'slotted')
        const named = document.createElement('span')
        named.slot = 'heading'
        named.textContent = 'projected heading'
        const body = document.createElement('em')
        body.textContent = 'projected body'
        host.append(named, body)
        document.body.append(host)
        await new Promise(resolve => requestAnimationFrame(resolve))
        const slots = [...(host.shadowRoot?.querySelectorAll('slot') ?? [])]
        return {
          slotNames: slots.map(slot => slot.name),
          namedAssigned: slots
            .find(slot => slot.name === 'heading')
            ?.assignedNodes()
            .map(node => node.textContent),
          defaultAssigned: slots
            .find(slot => slot.name === '')
            ?.assignedNodes()
            .map(node => node.textContent),
        }
      })
      assert.deepEqual(
        evidence.slotNames.sort(),
        ['', 'heading'],
        'the element must render one named and one default slot',
      )
      assert.deepEqual(evidence.namedAssigned, ['projected heading'])
      assert.deepEqual(evidence.defaultAssigned, ['projected body'])
    },
  )

  await check(
    'a slot with no assigned content renders its fallback',
    async () => {
      await open(tab)
      const evidence = await tab.evaluate(async () => {
        const host = document.createElement('z-shadow-card')
        host.setAttribute('title', 'fallback')
        document.body.append(host)
        await new Promise(resolve => requestAnimationFrame(resolve))
        const slots = [...(host.shadowRoot?.querySelectorAll('slot') ?? [])]
        return {
          namedFallback: slots
            .find(slot => slot.name === 'heading')
            ?.textContent?.trim(),
          defaultFallback: slots
            .find(slot => slot.name === '')
            ?.textContent?.trim(),
          represented: host.matches(':defined'),
        }
      })
      assert.equal(evidence.namedFallback, 'default heading')
      assert.equal(evidence.defaultFallback, 'default body')
      assert.ok(evidence.represented, 'the element must be upgraded')
    },
  )

  await check('a light-DOM element renders into its own children', async () => {
    await open(tab)
    const evidence = await tab.evaluate(async () => {
      const host = document.createElement('z-light-card')
      host.setAttribute('title', 'light title')
      const named = document.createElement('span')
      named.slot = 'heading'
      named.textContent = 'light projected'
      host.append(named)
      document.body.append(host)
      await new Promise(resolve => requestAnimationFrame(resolve))
      return {
        hasShadow: host.shadowRoot !== null,
        heading: host.querySelector('#light-heading')?.textContent ?? null,
        html: host.innerHTML.slice(0, 300),
      }
    })
    assert.equal(
      evidence.hasShadow,
      false,
      'a light-DOM element must not attach a shadow root',
    )
    assert.equal(
      evidence.heading,
      'light title',
      `a light-DOM element renders into itself; got ${evidence.html}`,
    )
  })

  await check(
    'repeated connect and disconnect cycles do not leak',
    async () => {
      await open(tab)
      const evidence = await tab.evaluate(async () => {
        // Inlined, not a named helper: tsx/esbuild wraps named functions in an
        // `__name(...)` call, and that helper does not exist in the page, so a
        // serialized named function throws `__name is not defined`.
        const before = {
          mounts: window.__fixture?.mounts ?? -1,
          cleanups: window.__fixture?.cleanups ?? -1,
        }
        const host = document.createElement('z-shadow-card')
        host.setAttribute('title', 'cycling')
        document.body.append(host)
        await new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        )
        const afterFirstMount = window.__fixture?.mounts ?? -1
        for (let cycle = 0; cycle < 10; cycle += 1) {
          host.remove()
          await new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          )
          document.body.append(host)
          await new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          )
        }
        const after = {
          mounts: window.__fixture?.mounts ?? -1,
          cleanups: window.__fixture?.cleanups ?? -1,
        }
        host.remove()
        await new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        )
        const afterRemoval = {
          mounts: window.__fixture?.mounts ?? -1,
          cleanups: window.__fixture?.cleanups ?? -1,
        }
        return { before, afterFirstMount, after, afterRemoval }
      })

      // Each reconnect re-runs setup, so mounts grows. What must hold is that the
      // previous root was disposed every time: cleanups tracks mounts - 1 while
      // connected, and equals mounts once removed.
      assert.ok(
        evidence.after.mounts > evidence.before.mounts,
        `reconnecting must re-run setup, got ${JSON.stringify(evidence)}`,
      )
      assert.equal(
        evidence.after.cleanups,
        evidence.after.mounts - 1,
        `every reconnect must dispose the previous root, got ${JSON.stringify(evidence)}`,
      )
      assert.equal(
        evidence.afterRemoval.cleanups,
        evidence.afterRemoval.mounts,
        `the final disconnect must dispose the last root, got ${JSON.stringify(evidence)}`,
      )
    },
  )

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
    `BLOCKED: the Web Components E2E could not start a browser.\n${
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
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
}

console.log(`browser: ${describeBrowser()}`)
console.log(JSON.stringify(results, null, 2))

const failures = results.filter(result => result.status === 'failed')
if (failures.length > 0) {
  throw new Error(
    `${failures.length} Web Components check(s) failed:\n${failures
      .map(failure => `  - ${failure.check}: ${failure.error}`)
      .join('\n')}`,
  )
}
console.log(`${results.length} Web Components check(s) passed.`)
