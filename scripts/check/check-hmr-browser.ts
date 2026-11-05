import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  chromium,
  expect,
  firefox,
  webkit,
  type BrowserType,
  type Page,
} from '@playwright/test'
import { createServer } from 'vite'

import { createZeus } from '../../packages/devtools/vite-plugin/src'

const root = path.resolve(import.meta.dirname, '../..')
const consumerRoot = process.env.ZEUS_HMR_CONSUMER_ROOT
  ? path.resolve(process.env.ZEUS_HMR_CONSUMER_ROOT)
  : root
const requireFromConsumer = createRequire(
  path.join(consumerRoot, 'package.json'),
)
const createPlugin: typeof createZeus =
  consumerRoot === root
    ? createZeus
    : (
        requireFromConsumer('@zeus-js/vite-plugin') as {
          createZeus: typeof createZeus
        }
      ).createZeus
const createViteServer: typeof createServer =
  consumerRoot === root
    ? createServer
    : (await import(pathToFileURL(requireFromConsumer.resolve('vite')).href))
        .createServer
const fixture = path.join(consumerRoot, 'temp/hmr-browser-fixture')
const output = process.env.ZEUS_HMR_OUTPUT_DIR
  ? path.resolve(process.env.ZEUS_HMR_OUTPUT_DIR)
  : path.join(root, 'temp/hmr-browser-report')
const sourcePath = path.join(fixture, 'src/main.tsx')
const bindingPath = path.join(fixture, 'src/bindings.tsx')
const bindingSource = `
import { createSignal, onCleanup, render, Show, For } from '@zeus-js/zeus'
import { createRuntimeDiagnosticsSession } from '@zeus-js/signal/diagnostics'

const state = window.__zeusBindingHmr ??= { mounts: 0, cleanups: 0, events: [], nodes: [], diagnostics: createRuntimeDiagnosticsSession() }
window.__ZEUS_DEVTOOLS_HOOK__ = { emit: event => state.events.push({ type: event.type, reason: event.payload?.reason, ownerId: event.ownerId, effectId: event.effectId, bindingId: event.bindingId }) }
state.mounts += 1
const [model, setModel] = createSignal({ count: 0, rows: [1, 2, 3] })
state.model = model
const first = render(() => state.diagnostics.run(() => {
  onCleanup(() => { state.cleanups += 1 })
  return <main class={'before'} style={'color: red'}>
    <h1>{'Heading'}</h1>
    <button id="count" onClick={() => setModel(previous => ({ ...previous, count: previous.count + 1 }))}>count: {model().count}</button>
    <button id="add" onClick={() => setModel(previous => ({ ...previous, rows: [...previous.rows, Math.max(...previous.rows) + 1] }))}>add</button>
    <button id="remove" onClick={() => setModel(previous => ({ ...previous, rows: previous.rows.slice(1) }))}>remove</button>
    <Show when={model().count > 0}><p id="conditional">{'Visible'}</p></Show>
    <ul><For each={model().rows} by={row => row}>{row => <li>{'Row'} {row}</li>}</For></ul>
    <dialog><input id="editor" value="initial" /></dialog>
    <div id="scroller" onScroll={() => {}} style="height: 50px; overflow: auto"><div style="height: 400px">scroll</div></div>
  </main>
}), document.getElementById('app'))
const second = render(() => state.diagnostics.run(() => {
  onCleanup(() => { state.cleanups += 1 })
  return <aside>{'Secondary'}</aside>
}), document.getElementById('secondary'))
state.nodes.push(document.querySelector('main'), document.querySelector('aside'))
state.dispose = () => { first(); second() }
`
const initialSource = `
import { createSignal, onCleanup, render } from '@zeus-js/zeus'

const state = globalThis.__zeusHmrState ??= { mounts: 0, cleanups: 0, buttons: [] }
state.mounts += 1
const [count, setCount] = createSignal(0)
const dispose = render(() => {
  onCleanup(() => { state.cleanups += 1 })
  return <button onClick={() => setCount(count() + 1)}>count: {count()}</button>
}, document.body)
state.buttons.push(document.body.querySelector('button'))
void dispose
// hmr-note: initial
`
const commentSource = initialSource.replace(
  '// hmr-note: initial',
  '// hmr-note: comment-only update',
)
const executableSource = initialSource.replace('count: ', 'updated: ')

const browserNames = (
  process.env.ZEUS_HMR_BROWSERS ?? 'chromium,firefox,webkit'
).split(',')
const browsers = { chromium, firefox, webkit }
interface BindingCheckEvidence {
  initial: Record<string, number>
  afterListChange: Record<string, number>
  disposed: Record<string, number>
  identityCounts: { owners: number; bindings: number; effects: number }
  hmrReasons: Array<{ type: string; reason: string }>
}
const results: Array<{
  browser: string
  status: 'passed' | 'failed'
  error?: string
  evidence?: BindingCheckEvidence
}> = []

await fs.mkdir(path.join(fixture, 'src'), { recursive: true })
const fixtureRoots = [
  ...new Set([path.resolve(fixture), await fs.realpath(fixture)]),
]
const consumerRoots = [
  ...new Set([path.resolve(consumerRoot), await fs.realpath(consumerRoot)]),
]
await fs.writeFile(
  path.join(fixture, 'index.html'),
  '<!doctype html><html><body><script type="module" src="/temp/hmr-browser-fixture/src/main.tsx"></script></body></html>',
)
await fs.writeFile(
  path.join(fixture, 'bindings.html'),
  '<!doctype html><html><body><div id="app"></div><div id="secondary"></div><script type="module" src="/temp/hmr-browser-fixture/src/bindings.tsx"></script></body></html>',
)
await fs.writeFile(
  path.join(fixture, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        jsx: 'preserve',
        jsxImportSource: '@zeus-js/zeus',
      },
    },
    null,
    2,
  )}\n`,
)
await fs.mkdir(output, { recursive: true })

declare global {
  interface Window {
    __zeusHmrState: {
      mounts: number
      cleanups: number
      buttons: Array<HTMLButtonElement | null>
    }
    __zeusBindingHmr: {
      mounts: number
      cleanups: number
      events: Array<{
        type: string
        ownerId?: number
        effectId?: number
        bindingId?: number
        reason?: unknown
      }>
      nodes: Array<Element | null>
      model(): { count: number; rows: number[] }
      savedModel?: unknown
      row?: Element | null
      diagnostics: { snapshot(): Record<string, number> }
      dispose(): void
    }
  }
}

try {
  for (const name of browserNames) {
    const browserType = browsers[name as keyof typeof browsers] as
      | BrowserType
      | undefined
    if (!browserType) throw new Error(`Unknown browser engine: ${name}`)

    let browser: Awaited<ReturnType<BrowserType['launch']>> | undefined
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    const pageErrors: string[] = []
    try {
      await fs.rm(sourcePath, { force: true })
      await fs.rm(bindingPath, { force: true })
      await Promise.all([
        fs.writeFile(sourcePath, initialSource),
        fs.writeFile(bindingPath, bindingSource),
      ])
      server = await createViteServer({
        root: consumerRoot,
        configFile: false,
        plugins: [createPlugin({ hmr: { preserveBindings: true } })],
        appType: 'spa',
        clearScreen: false,
        server: {
          host: '127.0.0.1',
          port: 0,
          strictPort: false,
          watch: {
            ignored: (file: string) => {
              const resolved = path.resolve(file)
              if (consumerRoots.includes(resolved)) return false
              for (const root of fixtureRoots) {
                if (resolved === root) return false
                if (resolved.startsWith(`${root}${path.sep}`)) return false
                if (`${root}${path.sep}`.startsWith(`${resolved}${path.sep}`)) {
                  return false
                }
              }
              return true
            },
          },
        },
      })
      await server.listen()
      await waitForWatcherReady(server.watcher)
      // The fixture is written before the server starts. Restricting the
      // watcher to its subtree avoids delayed events from the rest of the
      // workspace being delivered after the page loads.
      const address = server.httpServer?.address()
      if (!address || typeof address === 'string') {
        throw new Error('Vite dev server did not expose a TCP address')
      }
      const url = `http://127.0.0.1:${address.port}/temp/hmr-browser-fixture/`

      browser = await browserType.launch({
        headless: true,
        ...(name === 'chromium' ? { channel: 'chromium' } : {}),
      })
      const context = await browser.newContext()
      const page = await context.newPage()
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.goto(url)
      await page.waitForFunction(() => window.__zeusHmrState?.mounts === 1)

      const button = page.locator('button')
      await expect(button).toHaveText('count: 0')
      await button.click()
      await expect(button).toHaveText('count: 1')

      const initialIdentity = await page.evaluate(
        () =>
          window.__zeusHmrState.buttons[0] === document.querySelector('button'),
      )
      expect(initialIdentity).toBe(true)

      // A comment-only update must be ignored by Vite's module graph. The
      // signal value, DOM node, and cleanup count all remain unchanged.
      await fs.writeFile(sourcePath, commentSource)
      await page.waitForTimeout(750)
      await expect(button).toHaveText('count: 1')
      expect(
        await page.evaluate(() => ({
          mounts: window.__zeusHmrState.mounts,
          cleanups: window.__zeusHmrState.cleanups,
          same:
            window.__zeusHmrState.buttons[0] ===
            document.querySelector('button'),
        })),
      ).toEqual({ mounts: 1, cleanups: 0, same: true })

      // An executable update must dispose the old root before accepting the
      // new module. The new signal starts at zero and owns one fresh listener.
      await fs.writeFile(sourcePath, executableSource)
      await page.waitForFunction(
        () =>
          window.__zeusHmrState.mounts === 2 &&
          document.querySelector('button')?.textContent === 'updated: 0',
        undefined,
        { timeout: 10000 },
      )
      expect(
        await page.evaluate(() => ({
          mounts: window.__zeusHmrState.mounts,
          cleanups: window.__zeusHmrState.cleanups,
          replaced:
            window.__zeusHmrState.buttons[0] !==
            window.__zeusHmrState.buttons[1],
        })),
      ).toEqual({ mounts: 2, cleanups: 1, replaced: true })
      await page.locator('button').click()
      await expect(page.locator('button')).toHaveText('updated: 1')
      expect(pageErrors).toEqual([])
      const evidence = await checkBindingPatches(page, `${url}bindings.html`)
      expect(pageErrors).toEqual([])
      await page.screenshot({ path: path.join(output, `${name}.png`) })
      results.push({ browser: name, status: 'passed', evidence })
    } catch (error) {
      results.push({
        browser: name,
        status: 'failed',
        error: `${error instanceof Error ? error.stack : String(error)}${
          pageErrors.length > 0 ? `; pageerror=${pageErrors.join(' | ')}` : ''
        }`,
      })
    } finally {
      await browser?.close()
      await server?.close()
    }
  }
} finally {
  await fs.writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify({ scope: 'Vite 8 compiler-certified literal binding HMR', measuredAt: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version, consumerRoot, checks: ['comment preservation', 'literal text/class/style patch', 'two root identities', 'owner/binding/effect identities', 'unchanged allocation and listener counts', 'input/selection/focus/dialog/scroll/object state', 'list cleanup and future mounts', 'consecutive updates', 'compile error overlay and recovery', 'fresh page imports latest source', 'unsafe initialization remount', 'patch after remount without stale subscription', 'failed binding rollback and Vite reload', 'final resource disposal'], results }, null, 2)}\n`,
  )
  await fs.rm(fixture, { recursive: true, force: true })
}

expect(results).toHaveLength(browserNames.length)
expect(results.every(result => result.status === 'passed')).toBe(true)
console.log(`Vite HMR passed in ${browserNames.join(', ')}`)

async function checkBindingPatches(
  page: Page,
  url: string,
): Promise<BindingCheckEvidence> {
  await page.goto(url)
  await expect(page.locator('h1')).toHaveText('Heading')
  await page.locator('#count').click()
  await page.locator('#count').click()
  await page.locator('#remove').click()
  await page.locator('#add').click()
  await expect(page.locator('li')).toHaveText(['Row 2', 'Row 3', 'Row 4'])
  await page.evaluate(() => {
    const state = window.__zeusBindingHmr
    state.savedModel = state.model()
    state.row = document.querySelector('li')
    document.querySelector('dialog')!.showModal()
    document.querySelector('#scroller')!.scrollTop = 55
  })
  await page.locator('#editor').fill('typed before update')
  await page
    .locator('#editor')
    .evaluate((element: HTMLInputElement) => element.setSelectionRange(2, 8))
  const initial = await page.evaluate(() =>
    window.__zeusBindingHmr.diagnostics.snapshot(),
  )
  const identities = await page.evaluate(bindingIdentities)
  for (const ids of Object.values(identities))
    expect(ids.length).toBeGreaterThan(0)
  const signalModules = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .filter(name => /signal|diagnostics/.test(name)),
  )
  for (const kind of ['effects', 'bindings', 'listeners'])
    expect(
      initial[`${kind}Created`],
      `${kind}: ${JSON.stringify({ initial, signalModules })}`,
    ).toBeGreaterThan(0)

  // The very first hot edit may fail too. A syntax overlay must not dispose
  // the old tree, and repair must not be mistaken for an initial-load error.
  await fs.writeFile(bindingPath, breakMainClosingTag(bindingSource))
  await expect(page.locator('vite-error-overlay')).toBeAttached()
  await assertRetainedState(page)
  // The repair write must be a distinct watcher event. Writing it immediately
  // after the overlay appears can coalesce both edits on slower CI
  // filesystems, leaving the page on the last good module with no update.
  await page.waitForTimeout(250)

  const patched = bindingSource
    .replace("'before'", "'after'")
    .replace("'color: red'", "'color: blue'")
    .replace("'Heading'", "'Patched'")
    .replace("'Row'", "'Entry'")
    .replace("'Visible'", "'Still visible'")
    .replace("'Secondary'", "'Second root'")
  await fs.writeFile(bindingPath, patched)
  await expect(page.locator('h1')).toHaveText('Patched')
  await expect(page.locator('main')).toHaveClass('after')
  await expect(page.locator('main')).toHaveCSS('color', 'rgb(0, 0, 255)')
  await expect(page.locator('li')).toHaveText(['Entry 2', 'Entry 3', 'Entry 4'])
  await expect(page.locator('aside')).toHaveText('Second root')
  await expect(page.locator('#conditional')).toHaveText('Still visible')
  expect(
    await page.evaluate(() =>
      window.__zeusBindingHmr.events.some(
        event =>
          event.type === 'hmr:patch' && event.reason === 'literal-binding',
      ),
    ),
  ).toBe(true)
  expect(await page.evaluate(bindingIdentities)).toEqual(identities)
  expect(
    await page.evaluate(() => window.__zeusBindingHmr.diagnostics.snapshot()),
  ).toEqual(initial)
  await assertRetainedState(page)

  // A new list subtree must read the patched cell rather than the original
  // literal captured by the module. Removed rows release their old bindings.
  await page.evaluate(() => document.querySelector('dialog')!.close())
  await page.locator('#add').click()
  await page.locator('#remove').click()
  await expect(page.locator('li')).toHaveText(['Entry 3', 'Entry 4', 'Entry 5'])
  const afterListChange = await page.evaluate(() =>
    window.__zeusBindingHmr.diagnostics.snapshot(),
  )
  await page.evaluate(() => {
    const state = window.__zeusBindingHmr
    state.savedModel = state.model()
    state.row = document.querySelector('li')
    document.querySelector('dialog')!.showModal()
  })
  await page.locator('#editor').focus()
  await page
    .locator('#editor')
    .evaluate((element: HTMLInputElement) => element.setSelectionRange(2, 8))
  const again = patched.replace("'Patched'", "'Consecutive'")
  await fs.writeFile(bindingPath, again)
  await expect(page.locator('h1')).toHaveText('Consecutive')
  await assertRetainedState(page)
  expect(
    await page.evaluate(() => window.__zeusBindingHmr.diagnostics.snapshot()),
  ).toEqual(afterListChange)

  await fs.writeFile(bindingPath, breakMainClosingTag(again))
  await expect(page.locator('vite-error-overlay')).toBeAttached()
  await expect(page.locator('h1')).toHaveText('Consecutive')
  await assertRetainedState(page)
  const recovered = again.replace("'Consecutive'", "'Recovered'")
  await fs.writeFile(bindingPath, recovered)
  await expect(page.locator('h1')).toHaveText('Recovered')
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  await assertRetainedState(page)
  expect(
    await page.evaluate(() => window.__zeusBindingHmr.diagnostics.snapshot()),
  ).toEqual(afterListChange)

  // A later page must compile the latest source; suppressing the update must
  // not leave Vite's transform response cache at the first successful version.
  const fresh = await page.context().newPage()
  try {
    await fresh.goto(url)
    await expect(fresh.locator('h1')).toHaveText('Recovered')
    await expect(fresh.locator('li')).toHaveText([
      'Entry 1',
      'Entry 2',
      'Entry 3',
    ])
  } finally {
    await fresh.close()
  }

  // Changed initialization is not a data patch. Both original roots dispose
  // exactly once; the next click has one live listener and one fresh state.
  await fs.writeFile(bindingPath, recovered.replace('count: 0', 'count: 10'))
  await expect(page.locator('#count')).toHaveText('count: 10')
  expect(
    await page.evaluate(() => ({
      mounts: window.__zeusBindingHmr.mounts,
      cleanups: window.__zeusBindingHmr.cleanups,
      replaced:
        window.__zeusBindingHmr.nodes[0] !== document.querySelector('main'),
    })),
  ).toEqual({ mounts: 2, cleanups: 2, replaced: true })
  await page.locator('#count').click()
  await expect(page.locator('#count')).toHaveText('count: 11')
  const remounted = recovered.replace('count: 0', 'count: 10')
  const afterRemount = remounted.replace("'Recovered'", "'After remount'")
  await fs.writeFile(bindingPath, afterRemount)
  await expect(page.locator('h1')).toHaveText('After remount')
  await expect(page.locator('#count')).toHaveText('count: 11')
  expect(await page.evaluate(() => window.__zeusBindingHmr.mounts)).toBe(2)
  expect(
    await page.evaluate(() =>
      window.__zeusBindingHmr.events.some(
        event =>
          event.type === 'hmr:dispose' && event.reason === 'module-dispose',
      ),
    ),
  ).toBe(true)
  const hmrReasons = await page.evaluate(() =>
    window.__zeusBindingHmr.events
      .filter(event => event.type.startsWith('hmr:'))
      .map(event => ({
        type: event.type,
        reason: typeof event.reason === 'string' ? event.reason : '',
      })),
  )

  // A failed write must roll back and recover through the real Vite protocol.
  await page.locator('main').evaluate(element => {
    const original = element.setAttribute.bind(element)
    element.setAttribute = (name, value) => {
      if (name === 'class' && value === 'forced-failure')
        throw new Error('forced HMR write failure')
      original(name, value)
    }
  })
  await fs.writeFile(
    bindingPath,
    afterRemount.replace("'after'", "'forced-failure'"),
  )
  await page.waitForFunction(
    () =>
      window.__zeusBindingHmr?.mounts === 1 &&
      document.querySelector('main')?.className === 'forced-failure',
    undefined,
    { timeout: 10000 },
  )
  await expect(page.locator('#count')).toHaveText('count: 10')
  await page.locator('#count').click()
  await expect(page.locator('#count')).toHaveText('count: 11')
  await page.evaluate(() => window.__zeusBindingHmr.dispose())
  const disposed = await page.evaluate(() =>
    window.__zeusBindingHmr.diagnostics.snapshot(),
  )
  for (const kind of ['scopes', 'owners', 'effects', 'bindings', 'listeners']) {
    expect(disposed[`${kind}Created`]).toBe(disposed[`${kind}Disposed`])
  }
  return {
    initial,
    afterListChange,
    disposed,
    hmrReasons,
    identityCounts: {
      owners: identities.owners.length,
      bindings: identities.bindings.length,
      effects: identities.effects.length,
    },
  }
}

async function waitForWatcherReady(
  watcher: Awaited<ReturnType<typeof createServer>>['watcher'],
): Promise<void> {
  // Chokidar emits `ready` only once. `server.listen()` can resume after that
  // event has already fired, so a late `once('ready')` listener never runs.
  const emitted = (watcher as unknown as { _readyEmitted?: boolean })
    ._readyEmitted
  if (emitted === true) return

  await withTimeout(
    new Promise<void>(resolve => watcher.once('ready', resolve)),
    30000,
    'Vite watcher did not become ready',
  )
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function breakMainClosingTag(source: string): string {
  const index = source.lastIndexOf('</main>')
  if (index === -1) throw new Error('HMR fixture is missing its </main> tag')
  return `${source.slice(0, index)}</broken>${source.slice(index + 7)}`
}

function bindingIdentities() {
  const events = window.__zeusBindingHmr.events
  return {
    owners: [...new Set(events.map(event => event.ownerId).filter(Boolean))],
    bindings: [
      ...new Set(events.map(event => event.bindingId).filter(Boolean)),
    ],
    effects: [...new Set(events.map(event => event.effectId).filter(Boolean))],
  }
}

async function assertRetainedState(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => {
      const state = window.__zeusBindingHmr
      const editor = document.querySelector<HTMLInputElement>('#editor')!
      return {
        mounts: state.mounts,
        cleanups: state.cleanups,
        sameMain: state.nodes[0] === document.querySelector('main'),
        sameAside: state.nodes[1] === document.querySelector('aside'),
        sameRow: state.row === document.querySelector('li'),
        sameModel: state.savedModel === state.model(),
        count: state.model().count,
        value: editor.value,
        selection: [editor.selectionStart, editor.selectionEnd],
        focused: document.activeElement === editor,
        open: document.querySelector('dialog')!.open,
        scroll: document.querySelector('#scroller')!.scrollTop,
      }
    }),
  ).toEqual({
    mounts: 1,
    cleanups: 0,
    sameMain: true,
    sameAside: true,
    sameRow: true,
    sameModel: true,
    count: 2,
    value: 'typed before update',
    selection: [2, 8],
    focused: true,
    open: true,
    scroll: 55,
  })
}
