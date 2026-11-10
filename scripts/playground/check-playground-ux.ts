import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import {
  chromium,
  expect,
  firefox,
  webkit,
  type Browser,
  type Dialog,
  type Page,
} from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.join(root, 'examples/playground-editor/dist')
const output = path.join(root, 'temp/playground-ux')
const PORT = 8098
const engines = { chromium, firefox, webkit }
const requested = (
  process.env.PLAYGROUND_UX_BROWSERS ?? 'chromium,firefox,webkit'
)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

interface BrowserReport {
  browser: string
  passed: boolean
  error?: string
}

async function main(): Promise<void> {
  await fs.mkdir(output, { recursive: true })
  const server = await createStaticServer(dist)
  const report: BrowserReport[] = []
  try {
    for (const [name, engine] of Object.entries(engines)) {
      if (!requested.includes(name)) continue
      let browser: Browser | undefined
      try {
        browser = await engine.launch({
          headless: true,
          ...(name === 'chromium' ? { channel: 'chromium' } : {}),
        })
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        })
        const page = await context.newPage()
        const pageErrors: string[] = []
        page.on('pageerror', error => pageErrors.push(error.message))
        await runChecks(page, name)
        if (pageErrors.length > 0)
          throw new Error(`page errors: ${pageErrors.join('; ')}`)
        report.push({ browser: name, passed: true })
        console.log(`[playground-ux] ${name}: PASS`)
      } catch (error) {
        report.push({
          browser: name,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        })
        console.error(`[playground-ux] ${name}: FAIL`, error)
      } finally {
        await browser?.close()
      }
    }
  } finally {
    await closeServer(server)
  }
  await fs.writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify({ sourceCommit: process.env.GITHUB_SHA, results: report }, null, 2)}\n`,
  )
  if (report.some(result => !result.passed)) process.exitCode = 1
}

async function runChecks(page: Page, browserName: string): Promise<void> {
  const base = `http://127.0.0.1:${PORT}`
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  await waitReady(page)
  if (browserName === 'chromium') {
    await page.screenshot({
      path: path.join(output, '1440-native.png'),
    })
  }

  // Preview maximize and restore.
  await page.getByTestId('preview-max').click()
  if (await page.locator('.pg-editor-pane').isVisible()) {
    throw new Error('maximize did not hide the editor pane')
  }
  await page.getByTestId('preview-max').click()
  if (!(await page.locator('.pg-editor-pane').isVisible())) {
    throw new Error('restore did not show the editor pane')
  }

  // Draggable split follows the pointer. Regression guard: a clamp written as
  // `Math.max(30, Math.min(70), value)` evaluates to 70 for every input, which
  // pinned the divider to one side while the stored value still looked fine.
  const trackBefore = await splitValue(page)
  const trackBox = await page.locator('.pg-split').boundingBox()
  if (!trackBox) throw new Error('split divider is not visible')
  const trackX = trackBox.x + trackBox.width / 2
  const trackY = trackBox.y + trackBox.height / 2
  await page.mouse.move(trackX, trackY)
  await page.mouse.down()
  await page.mouse.move(trackX - 60, trackY, { steps: 6 })
  await page.waitForTimeout(120)
  const draggingLeft = await splitValue(page)
  await page.mouse.move(trackX + 60, trackY, { steps: 6 })
  await page.waitForTimeout(120)
  const draggingRight = await splitValue(page)
  await page.mouse.up()
  await page.waitForTimeout(120)
  if (draggingLeft >= trackBefore) {
    throw new Error(
      `dragging left did not shrink the editor pane: ${trackBefore} -> ${draggingLeft}`,
    )
  }
  if (draggingRight <= draggingLeft) {
    throw new Error(
      `dragging right did not widen the editor pane: ${draggingLeft} -> ${draggingRight}`,
    )
  }
  await page.evaluate(() =>
    localStorage.removeItem('zeus-playground.settings.v2'),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitReady(page)

  // Draggable split with a persisted width.
  const splitBefore = await splitValue(page)
  // Count storage writes during the drag: persisting per pointermove used to
  // write ~40 times and stutter the reflow. Only the release should persist.
  await page.evaluate(() => {
    ;(window as unknown as { __writes: number }).__writes = 0
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (this: Storage, ...args) {
      ;(window as unknown as { __writes: number }).__writes += 1
      return original.apply(this, args as [string, string])
    }
  })
  await dragSplit(page, 100)
  const writesDuringDrag = await page.evaluate(
    () => (window as unknown as { __writes: number }).__writes,
  )
  if (writesDuringDrag > 2) {
    throw new Error(
      `split wrote storage ${writesDuringDrag} times during one drag; persist on release instead`,
    )
  }
  const splitAfter = await splitValue(page)
  if (splitAfter <= splitBefore + 2) {
    throw new Error(`split did not move: ${splitBefore} -> ${splitAfter}`)
  }
  const storedSplit = await page.evaluate(() => {
    const raw = localStorage.getItem('zeus-playground.settings.v2')
    return raw ? (JSON.parse(raw) as { splitPercent?: number }).splitPercent : 0
  })
  if (Math.abs((storedSplit ?? 0) - splitAfter) > 1) {
    throw new Error(
      `split width was not persisted: ${splitAfter} vs ${storedSplit}`,
    )
  }

  // Theme, language and font size from Settings. Light + English are the
  // shipped defaults, so the round trip starts by switching away from them.
  await page.getByTestId('settings').click()
  await page.locator('[data-testid="theme-select"]').selectOption('dark')
  if (
    (await page.evaluate(() => document.documentElement.dataset.theme)) !==
    'dark'
  ) {
    throw new Error('dark theme was not applied')
  }
  await page.locator('[data-testid="theme-select"]').selectOption('light')
  if (
    (await page.evaluate(() => document.documentElement.dataset.theme)) !==
    'light'
  ) {
    throw new Error('light theme was not applied')
  }
  await page.locator('[data-testid="locale-select"]').selectOption('zh')
  if ((await page.evaluate(() => document.documentElement.lang)) !== 'zh-CN') {
    throw new Error('Chinese locale was not applied')
  }
  await page.locator('[data-testid="locale-select"]').selectOption('en')
  if ((await page.evaluate(() => document.documentElement.lang)) !== 'en') {
    throw new Error('English locale was not restored')
  }
  await page.locator('.pg-popover input[type="range"]').fill('16')
  const fontPixels = await page
    .locator('.cm-content')
    .evaluate(element => getComputedStyle(element).fontSize)
  if (fontPixels !== '16px') {
    throw new Error(`font size was not applied: ${fontPixels}`)
  }
  await page.locator('.pg-popover input[type="range"]').fill('14')
  await page.getByTestId('settings').click()

  // Keep deterministic manual runs; auto-run is tested separately below.
  await page.getByTestId('auto-run').click()

  // Console bridge.
  await setSource(
    page,
    `import { render } from '@zeus-js/zeus'\nconsole.log('ux-console-marker', 42)\nrender(() => <p>Console ready</p>, document.querySelector('#root')!)\n`,
  )
  await run(page)
  await page.getByTestId('tab-console').click()
  await page
    .getByTestId('console')
    .getByText('ux-console-marker 42')
    .waitFor({ timeout: 10_000 })

  // Native modals stay disabled (untrusted preview code must not block the
  // editor), but the sandbox reports each suppressed call to the Console.
  const dialogs: string[] = []
  const onDialog = (dialog: Dialog) => {
    dialogs.push(`${dialog.type()}:${dialog.message()}`)
    void dialog.dismiss()
  }
  page.on('dialog', onDialog)
  await setSource(
    page,
    `import { render } from '@zeus-js/zeus'
const confirmed = confirm('blocked confirm?')
const named = prompt('blocked prompt?', 'default')
console.log('modal-results', confirmed, named)
render(
  () => <button onClick={() => alert('blocked alert?')}>Open modal</button>,
  document.querySelector('#root')!,
)
`,
  )
  await run(page)
  // The Console tab replaces the preview pane, so switch back before clicking
  // the preview button; hidden tabs are not actionable.
  await page.getByTestId('tab-preview').click()
  await page
    .frameLocator('[data-testid="preview-frame"]')
    .getByRole('button', { name: 'Open modal' })
    .click()
  await page.getByTestId('tab-console').click()
  const consolePanel = page.getByTestId('console')
  await consolePanel
    .getByText('ZEUS_PLAYGROUND_NO_MODALS')
    .first()
    .waitFor({ timeout: 10_000 })
  // Entries arrive through the bounded, batched console bridge, so wait for
  // the click-triggered report instead of reading the panel once.
  await consolePanel
    .getByText('alert("blocked alert?")', { exact: false })
    .waitFor({ timeout: 10_000 })
  const consoleText = (await consolePanel.textContent()) ?? ''
  for (const call of [
    'confirm("blocked confirm?")',
    'prompt("blocked prompt?", "default")',
    'alert("blocked alert?")',
  ]) {
    if (!consoleText.includes(call)) {
      throw new Error(`suppressed modal was not reported: ${call}`)
    }
  }
  if (!consoleText.includes('modal-results false null')) {
    throw new Error('suppressed modals must return the browser-blocked values')
  }
  if (dialogs.length > 0) {
    throw new Error(`preview opened a native dialog: ${dialogs.join('; ')}`)
  }
  page.off('dialog', onDialog)

  // Diagnostics, stale preview and recovery.
  await setSource(page, 'export const App = () => <div>\n')
  await run(page, false)
  await page.getByTestId('tab-problems').click()
  await page.getByTestId('problems').waitFor({ timeout: 10_000 })
  if (!(await state(page)).stale) {
    throw new Error('preview was not marked stale')
  }
  await page.locator('.pg-problem').first().click()
  await page.waitForTimeout(200)
  const editorFocused = await page.evaluate(
    () => document.activeElement?.closest('.cm-content') != null,
  )
  if (!editorFocused) throw new Error('problem did not focus the editor')
  if ((await page.locator('.cm-error-line').count()) === 0) {
    throw new Error('compiler error marker is missing from the editor')
  }
  await setSource(
    page,
    `import { render } from '@zeus-js/zeus'\nrender(() => <p>Recovered</p>, document.querySelector('#root')!)\n`,
  )
  await run(page)
  await page
    .frameLocator('[data-testid="preview-frame"]')
    .getByText('Recovered')
    .waitFor()

  // File creation, switching and removal.
  await page.getByTestId('add-file').click()
  await page.getByRole('tab', { name: 'component-4.tsx' }).waitFor()
  await page.getByRole('tab', { name: 'main.tsx' }).click()
  await page.getByRole('tab', { name: 'component-4.tsx' }).click()
  await page.getByTestId('remove-file').click()

  // Auto-run toggle and manual run.
  const before = await state(page)
  await setSource(
    page,
    `import { render } from '@zeus-js/zeus'\nrender(() => <p>Auto off</p>, document.querySelector('#root')!)\n`,
  )
  await page.waitForTimeout(1_200)
  const after = await state(page)
  if (after.buildSequence !== before.buildSequence) {
    throw new Error(
      `auto-run compiled while disabled: ${JSON.stringify(await state(page))}`,
    )
  }
  await run(page)
  await page.getByTestId('auto-run').click()

  // Keyboard run and save shortcuts inside CodeMirror.
  await page.locator('.cm-content').click()
  const beforeKey = (await state(page)).buildSequence
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.waitForFunction(
    sequence =>
      window.__zeusPlayground!.getState().buildSequence > sequence &&
      !window.__zeusPlayground!.getState().busy,
    beforeKey,
    { timeout: 20_000 },
  )
  await page.keyboard.press('ControlOrMeta+s')
  await page.getByTestId('save-state').getByText('Saved locally').waitFor()

  // Example gallery.
  await page.getByTestId('examples').click()
  await page
    .getByTestId('example-native-show-for')
    .evaluate(element => (element as HTMLElement).click())
  await run(page)
  await page
    .frameLocator('[data-testid="preview-frame"]')
    .locator('li')
    .first()
    .waitFor()

  // Stop and rerun.
  await run(page)
  await page.getByTestId('stop').click()
  await page.getByTestId('status').getByText('Stopped').waitFor()
  await run(page)

  // Persistence across reload.
  await setSource(
    page,
    `import { render } from '@zeus-js/zeus'\nrender(() => <p>Persisted UX marker</p>, document.querySelector('#root')!)\n`,
  )
  await page.evaluate(() => window.__zeusPlayground?.save())
  await page.getByTestId('tab-output').click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitReady(page)
  if (!(await source(page)).includes('Persisted UX marker')) {
    throw new Error('draft did not survive reload')
  }
  if ((await state(page)).activeTab !== 'output') {
    throw new Error('active result tab did not survive reload')
  }
  if (Math.abs((await splitValue(page)) - splitAfter) > 1) {
    throw new Error('split width did not survive reload')
  }
  await dragSplit(page, -100)

  // Share URL round-trip.
  const shared = await page.evaluate(() => window.__zeusPlayground?.shareUrl())
  if (!shared) throw new Error('share URL was not created')
  const sharedPage = await page.context().newPage()
  await sharedPage.goto(shared, { waitUntil: 'domcontentloaded' })
  await sharedPage.waitForTimeout(1_500)
  const sharedSource = await sharedPage.evaluate(
    () => window.__zeusPlayground?.getSource() ?? '',
  )
  if (!sharedSource.includes('Persisted UX marker')) {
    throw new Error('share URL did not restore the project')
  }
  await sharedPage.close()

  // WebC inspector and React/Vue consumption.
  await page.evaluate(() =>
    window.__zeusPlayground?.loadExample('webc-counter-slots'),
  )
  await run(page)
  await page.getByTestId('tab-inspector').click()
  await page.getByTestId('webc-manifest').getByText('z-counter').waitFor()
  await page.getByTestId('preview-frameworks').click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="framework-preview-status"]')
        ?.textContent?.includes('mounted'),
    null,
    { timeout: 20_000 },
  )

  // Every shipped example must compile and run.
  if (browserName === 'chromium') {
    await page.getByTestId('auto-run').click()
    const ids = [
      'native-hello',
      'native-counter',
      'native-show-for',
      'native-props',
      'native-todo',
      'native-lifecycle',
      'native-router-query',
      'webc-basic',
      'webc-counter-slots',
      'webc-props-events',
      'webc-shadow',
      'webc-slots',
    ]
    for (const id of ids) {
      const loaded = await page.evaluate(
        exampleId => window.__zeusPlayground!.loadExample(exampleId),
        id,
      )
      if (!loaded) throw new Error(`example ${id} was not found`)
      try {
        await run(page)
      } catch (error) {
        const failed = await state(page)
        throw new Error(
          `example ${id} did not run: ${JSON.stringify(failed.diagnostics)} (${failed.previewStatus}); ${String(error)}`,
        )
      }
      const exampleState = await state(page)
      if (exampleState.diagnostics.some(item => item.severity === 'error')) {
        throw new Error(
          `example ${id} failed: ${JSON.stringify(exampleState.diagnostics)}`,
        )
      }
      if (id === 'native-hello') {
        // The first example must demonstrate a signal without a native modal:
        // clicking its button increments the count rendered in the preview.
        await page.getByTestId('tab-preview').click()
        const helloFrame = page.frameLocator('[data-testid="preview-frame"]')
        const helloButton = helloFrame.locator('button')
        await expect(helloButton).toHaveText('Signals clicked 0 times')
        await helloButton.click()
        await expect(helloButton).toHaveText('Signals clicked 1 times')
      }
      if (id.startsWith('webc-')) {
        await page.getByTestId('tab-inspector').click()
        const manifest =
          (await page.getByTestId('webc-manifest').textContent()) ?? ''
        if (manifest.includes('"components": []')) {
          throw new Error(`example ${id} produced an empty manifest`)
        }
        const declarations =
          (await page.getByTestId('webc-declarations').textContent()) ?? ''
        if (!declarations.includes('interface')) {
          throw new Error(`example ${id} produced no DTS declaration`)
        }
      }
    }
    await page.getByTestId('auto-run').click()
    await page.evaluate(() =>
      window.__zeusPlayground!.loadExample('webc-counter-slots'),
    )
    await run(page)
    await page.getByTestId('tab-inspector').click()
    await page.getByTestId('webc-manifest').getByText('z-counter').waitFor()
  }

  // Responsive layouts.
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.waitForTimeout(300)
  if (browserName === 'chromium') {
    await page.screenshot({
      path: path.join(output, '1024-webc.png'),
    })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  if (browserName === 'chromium') {
    await page.screenshot({
      path: path.join(output, '390-webc.png'),
    })
  }
  if (
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    )
  ) {
    throw new Error('mobile layout overflows horizontally')
  }
  await page.locator('.pg-mobile-switch button').first().click()
  await page.waitForTimeout(150)
  await page.locator('.pg-mobile-switch button').last().click()
  await page.waitForTimeout(300)
  const overflowingTabs = await page
    .locator('.pg-result-tabs')
    .evaluate(element => element.scrollWidth > element.clientWidth + 1)
  if (overflowingTabs) throw new Error('mobile result tabs overflow')
  if (
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    )
  ) {
    throw new Error('mobile preview overflows horizontally')
  }
  if (browserName === 'chromium') {
    await page.screenshot({
      path: path.join(output, '390-webc-preview.png'),
    })
  }
  const namedButtons = await page
    .locator('button')
    .evaluateAll(buttons =>
      buttons.every(
        button =>
          (button.textContent ?? '').trim().length > 0 ||
          button.getAttribute('aria-label'),
      ),
    )
  if (!namedButtons) throw new Error('a button has no accessible name')
}

async function splitValue(page: Page): Promise<number> {
  return page
    .locator('.pg-workspace')
    .evaluate(
      element =>
        Number.parseFloat(
          (element as HTMLElement).style.getPropertyValue('--pg-editor-width'),
        ) || 0,
    )
}

async function dragSplit(page: Page, deltaX: number): Promise<void> {
  const split = page.locator('.pg-split')
  const box = await split.boundingBox()
  if (!box) throw new Error('split divider is not visible')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + deltaX, y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(100)
}

async function state(page: Page) {
  return page.evaluate(() => window.__zeusPlayground!.getState())
}

async function source(page: Page): Promise<string> {
  return page.evaluate(() => window.__zeusPlayground!.getSource())
}

async function setSource(page: Page, value: string): Promise<void> {
  await page.evaluate(value => window.__zeusPlayground!.setSource(value), value)
}

async function run(page: Page, expectSuccess = true): Promise<void> {
  const before = await state(page)
  await page.evaluate(() => window.__zeusPlayground!.run())
  if (expectSuccess) await waitReady(page)
  await page.waitForFunction(
    sequence => window.__zeusPlayground!.getState().buildSequence > sequence,
    before.buildSequence,
    { timeout: 30_000 },
  )
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__zeusPlayground?.getState().previewReady === true,
    null,
    { timeout: 45_000 },
  )
}

async function createStaticServer(directory: string): Promise<http.Server> {
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const pathname =
      requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
    const file = path.resolve(directory, `.${pathname}`)
    if (!file.startsWith(`${directory}${path.sep}`)) {
      response.writeHead(403).end()
      return
    }
    try {
      const body = await fs.readFile(file)
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      response.setHeader('Content-Type', contentType(path.extname(file)))
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>(resolve => server.listen(PORT, '0.0.0.0', resolve))
  return server
}

function contentType(extension: string): string {
  if (extension === '.html') return 'text/html; charset=utf-8'
  if (extension === '.js') return 'text/javascript; charset=utf-8'
  if (extension === '.css') return 'text/css; charset=utf-8'
  if (extension === '.wasm') return 'application/wasm'
  return 'application/octet-stream'
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
}

declare global {
  interface Window {
    __zeusPlayground?: {
      getSource(): string
      setSource(value: string): void
      getActivePath(): string
      getFiles(): readonly { path: string; content: string }[]
      selectFile(path: string): void
      selectProduct(product: 'native-lab' | 'webc-studio'): void
      loadExample(id: string): boolean
      run(): Promise<void>
      stop(): Promise<void>
      save(): void
      shareUrl(): Promise<string | undefined>
      getState(): {
        previewReady: boolean
        locale: 'en' | 'zh'
        theme: 'light' | 'dark'
        product: 'native-lab' | 'webc-studio'
        files: readonly { path: string; content: string }[]
        activePath: string
        source: string
        status: string
        previewStatus: string
        busy: boolean
        stale: boolean
        diagnostics: readonly {
          id: string
          file: string
          severity: 'error' | 'warning' | 'info'
          code: string
          message: string
          line?: number
          column?: number
        }[]
        console: readonly {
          level: string
          message: string
          timestamp: number
        }[]
        devtools: unknown
        buildSequence: number
        autoRun: boolean
        lastCompileKind: 'auto' | 'manual' | 'none'
        buildMetrics: {
          compileMs: number
          previewMs: number
          domBytes: number
          ssrBytes: number
          runs: number
        }
        activeTab: string
      }
    }
  }
}

void main()
