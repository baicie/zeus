import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium, expect, firefox, webkit } from '@playwright/test'
import { transformModule } from '@zeus-js/compiler'

const root = path.resolve(import.meta.dirname, '../..')
;(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false
const runtimeSSR = (await import(
  pathToFileURL(
    path.join(
      root,
      'packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js',
    ),
  ).href
)) as { renderToString(input: () => unknown): string }
const output = path.join(root, 'temp/auto-hydration-browser')
const source = `
const Child = props => <li class="child" title={props.title}>{props.label}</li>
export const App = props => (
  <main class="auto" title={props.title}>
    <input prop:value={props.name} aria-label="name" />
    <button onClick={props.onClick}>count: {props.count}</button>
    <Child title={props.title} label={props.label} />
    <b>{props.label}</b>
  </main>
)
`

const initialProps = {
  title: 'server',
  count: 3,
  name: 'server',
  label: 'server label',
}

const dom = compile(source, 'dom')
const ssr = compile(source, 'ssr')
const serverHtml = await renderServer(ssr)
const runtime = await fs
  .readFile(
    path.join(
      root,
      'packages/core/runtime-dom/dist/runtime-dom.esm-bundler.js',
    ),
    'utf8',
  )
  .then(sourceText =>
    sourceText.split('"@zeus-js/signal/internal"').join('"/internal.js"'),
  )
const internal = await fs
  .readFile(path.join(root, 'packages/core/signal/dist/internal.js'), 'utf8')
  .then(sourceText =>
    sourceText.split('"@zeus-js/shared"').join('"/shared.js"'),
  )
const shared = await fs.readFile(
  path.join(root, 'packages/core/shared/dist/shared.esm-bundler.js'),
  'utf8',
)
const signal = await fs
  .readFile(
    path.join(root, 'packages/core/signal/dist/signal.esm-bundler.js'),
    'utf8',
  )
  .then(sourceText =>
    sourceText.split('"@zeus-js/signal/internal"').join('"/internal.js"'),
  )
const clientApp = dom.code.split('"@zeus-js/runtime-dom"').join('"/runtime.js"')
const client = `
import { createSignal } from '/signal.js'
import { render } from '/runtime.js'
import { App } from '/app.js'

const initial = ${JSON.stringify(initialProps)}
const [state, setState] = createSignal({ ...initial, onClick: undefined })
const props = {}
for (const key of Object.keys(initial)) {
  Object.defineProperty(props, key, { enumerable: true, get: () => state()[key] })
}
props.onClick = () => setState(current => ({ ...current, count: current.count + 1 }))
const mismatchProps = { ...initial, onClick: () => {} }

let dispose
let mismatchDispose
window.autoHydration = {
  start() {
    const container = document.querySelector('#app')
    const before = {
      main: container.querySelector('main'),
      input: container.querySelector('input'),
      child: container.querySelector('li.child'),
      button: container.querySelector('button'),
    }
    dispose = render(() => App(props), container, {
      hydrate: true,
      onHydrationError: error => { throw error },
    })
    return {
      sameMain: container.querySelector('main') === before.main,
      sameInput: container.querySelector('input') === before.input,
      sameChild: container.querySelector('li.child') === before.child,
      sameButton: container.querySelector('button') === before.button,
    }
  },
  update() {
    setState(current => ({ ...current, title: 'client', label: 'updated label', count: 7 }))
  },
  mismatch() {
    const container = document.querySelector('#mismatch')
    const serverMain = container.querySelector('main')
    serverMain.replaceWith(document.createElement('section'))
    const errors = []
    mismatchDispose = render(() => App(mismatchProps), container, {
      hydrate: true,
      onHydrationError: error => errors.push(error.code),
    })
    return {
      errors,
      fallback: container.querySelector('main')?.hasAttribute('data-zeus-hydration-fallback') ?? false,
      outside: document.querySelector('#outside')?.textContent,
    }
  },
  dispose() {
    dispose?.()
    mismatchDispose?.()
  },
}
`

await fs.mkdir(output, { recursive: true })
const server = http.createServer((request, response) => {
  const assets: Record<string, string> = {
    '/runtime.js': runtime,
    '/internal.js': internal,
    '/shared.js': shared,
    '/signal.js': signal,
    '/app.js': clientApp,
    '/client.js': client,
  }
  if (request.url && assets[request.url]) {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(assets[request.url])
    return
  }
  if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!doctype html><html lang="en"><body>
      <div id="app">${serverHtml}</div>
      <div id="mismatch">${serverHtml}</div>
      <footer id="outside">outside</footer>
      <script type="module" src="/client.js"></script>
    </body></html>`)
    return
  }
  response.writeHead(404).end()
})

await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`
const results: Array<{ browser: string; status: string; error?: string }> = []
const browserNames = (
  process.env.ZEUS_AUTO_HYDRATION_BROWSERS ?? 'chromium,firefox,webkit'
).split(',')
const browserEngines = { chromium, firefox, webkit }

declare global {
  interface Window {
    autoHydration: {
      start(): {
        sameMain: boolean
        sameInput: boolean
        sameChild: boolean
        sameButton: boolean
      }
      update(): void
      mismatch(): {
        errors: string[]
        fallback: boolean
        outside: string | null
      }
      dispose(): void
    }
  }
}

try {
  for (const name of browserNames) {
    const engine = browserEngines[name as keyof typeof browserEngines]
    if (!engine) throw new Error(`Unknown browser engine: ${name}`)
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    let pageErrors: string[] = []
    try {
      browser = await engine.launch({
        headless: true,
        ...(name === 'chromium' ? { channel: 'chromium' } : {}),
      })
      const page = await browser.newPage()
      pageErrors = []
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.goto(origin)
      await page.waitForFunction(() => !!window.autoHydration)

      const input = page.locator('#app input')
      await expect(input).toHaveValue('server')
      await input.fill('typed before hydration')
      await input.focus()
      await input.evaluate((node: HTMLInputElement) =>
        node.setSelectionRange(2, 8),
      )

      expect(await page.evaluate(() => window.autoHydration.start())).toEqual({
        sameMain: true,
        sameInput: true,
        sameChild: true,
        sameButton: true,
      })
      await expect(input).toHaveValue('typed before hydration')
      await expect(input).toBeFocused()
      expect(
        await input.evaluate((node: HTMLInputElement) => [
          node.selectionStart,
          node.selectionEnd,
        ]),
      ).toEqual([2, 8])

      await page.getByRole('button').first().click()
      await expect(page.locator('#app button')).toHaveText('count: 4')
      await page.evaluate(() => window.autoHydration.update())
      await expect(page.locator('#app main')).toHaveAttribute('title', 'client')
      await expect(page.locator('#app .child')).toHaveText('updated label')
      await expect(page.locator('#app button')).toHaveText('count: 7')

      expect(
        await page.evaluate(() => window.autoHydration.mismatch()),
      ).toEqual({
        errors: ['ZEUS_HYDRATION_TAG_MISMATCH'],
        fallback: true,
        outside: 'outside',
      })
      expect(pageErrors).toEqual([])

      await page.evaluate(() => window.autoHydration.dispose())
      expect(
        await page.evaluate(
          () =>
            document.querySelector('#app')?.childNodes.length === 0 &&
            document.querySelector('#mismatch')?.childNodes.length === 0,
        ),
      ).toBe(true)
      await page.screenshot({ path: path.join(output, `${name}.png`) })
      results.push({ browser: name, status: 'passed' })
    } catch (error) {
      results.push({
        browser: name,
        status: 'failed',
        error: `${String(error)}${pageErrors.length > 0 ? `; pageerror=${pageErrors.join(' | ')}` : ''}`,
      })
    } finally {
      await browser?.close()
    }
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  await fs.writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify({ scope: 'compiled automatic hydration', results }, null, 2)}\n`,
  )
}

assert(
  results.length === browserNames.length &&
    results.every(result => result.status === 'passed'),
  JSON.stringify(results),
)
console.log(
  `Automatic hydration passed in ${browserNames.join(', ')}${
    browserNames.length === 3 ? '' : ' (selected engines)'
  }`,
)

function compile(sourceText: string, target: 'dom' | 'ssr') {
  const result = transformModule({
    source: sourceText,
    filename: 'auto-hydration-browser.tsx',
    target,
    runtimeModule:
      target === 'dom' ? '@zeus-js/runtime-dom' : '@zeus-js/runtime-ssr',
    delegateEvents: target === 'dom',
    sourceMap: false,
    autoHydrate: true,
  })
  if (result.diagnostics.length > 0) {
    throw new Error(JSON.stringify(result.diagnostics))
  }
  return result
}

async function renderServer(
  result: ReturnType<typeof compile>,
): Promise<string> {
  const runtime = pathToFileURL(
    path.join(
      root,
      'packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js',
    ),
  ).href
  const executable = result.code
    .split('"@zeus-js/runtime-ssr"')
    .join(JSON.stringify(runtime))
  const url = `data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`
  const module = (await import(url)) as {
    App(props: typeof initialProps): unknown
  }
  return runtimeSSR.renderToString(() => module.App(initialProps))
}
