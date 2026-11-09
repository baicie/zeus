/**
 * Verifies the Playground's theme and language switches in real browsers:
 * light/English defaults, live switching, persistence across reload, the
 * pre-paint theme, localized product/example copy and CodeMirror theming.
 *
 * Run after `pnpm --filter @zeus-js/example-playground-editor build`.
 */
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type Page,
} from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const dist = path.join(root, 'examples/playground-editor/dist')
const output = path.join(root, 'temp/playground-theme-i18n')
const PORT = 8099
const engines = { chromium, firefox, webkit }
const requested = (
  process.env.PLAYGROUND_THEME_BROWSERS ?? 'chromium,firefox,webkit'
)
  .split(',')
  .map(value => value.trim())
  .filter(Boolean)

interface Check {
  readonly name: string
  readonly ok: boolean
  readonly detail?: string
}

const checks: Check[] = []
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) })
  if (!ok) failures.push(`${name}: ${detail ?? ''}`)
}

async function main(): Promise<void> {
  await fs.mkdir(output, { recursive: true })
  await checkBootstrapHash()
  const server = await createStaticServer(dist)
  try {
    for (const [name, engine] of Object.entries(engines)) {
      if (!requested.includes(name)) continue
      const browser = await engine.launch({
        headless: true,
        ...(name === 'chromium' ? { channel: 'chromium' } : {}),
      })
      try {
        await runChecks(browser, name)
        console.log(`[playground-theme-i18n] ${name}: done`)
      } catch (error) {
        failures.push(
          `${name}: ${error instanceof Error ? error.message : String(error)}`,
        )
      } finally {
        await browser.close()
      }
    }
  } finally {
    await closeServer(server)
  }
  await fs.writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify({ sourceCommit: process.env.GITHUB_SHA, checks, failures }, null, 2)}\n`,
  )
  const passed = checks.filter(item => item.ok).length
  console.log(`\n${passed}/${checks.length} checks passed`)
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  }
}

async function runChecks(browser: Browser, name: string): Promise<void> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  try {
    const base = `http://127.0.0.1:${PORT}`
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await waitReady(page)

    // 1. Defaults: light surface, English copy, product title.
    const defaults = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      lang: document.documentElement.lang,
      title: document.title,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      run: document
        .querySelector('[data-testid="compile"]')
        ?.textContent?.trim(),
    }))
    check(
      `${name} defaults to light`,
      defaults.theme === 'light',
      JSON.stringify(defaults),
    )
    check(`${name} defaults to English`, defaults.lang === 'en', defaults.lang)
    check(
      `${name} default copy is English`,
      defaults.run === 'Run',
      defaults.run,
    )
    check(
      `${name} default product title`,
      defaults.title === 'Zeus Native Lab',
      defaults.title,
    )
    check(
      `${name} light background`,
      defaults.bodyBg === 'rgb(243, 243, 243)',
      defaults.bodyBg,
    )

    // 2. Language switch re-renders live state, not just static labels.
    await page.getByTestId('settings').click()
    await page.locator('[data-testid="locale-select"]').selectOption('zh')
    await page.waitForTimeout(200)
    const zh = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      run: document
        .querySelector('[data-testid="compile"]')
        ?.textContent?.trim(),
      tabs: [...document.querySelectorAll('.pg-result-tab')].map(tab =>
        tab.textContent?.trim(),
      ),
      status: document.querySelector('[data-testid="status"]')?.textContent,
      preview: document.querySelector('[data-testid="preview-status"]')
        ?.textContent,
      counter: document.querySelector('[data-testid="devtools-hmr-count"]')
        ?.textContent,
      save: document.querySelector('[data-testid="save-state"]')?.textContent,
      title: document.title,
    }))
    check(`${name} zh lang attribute`, zh.lang === 'zh-CN', zh.lang)
    check(`${name} zh run label`, zh.run === '运行', zh.run)
    check(
      `${name} zh result tabs`,
      zh.tabs.includes('预览') && zh.tabs.includes('控制台'),
      zh.tabs.join('|'),
    )
    check(
      `${name} zh status message`,
      zh.status?.includes('已编译') === true,
      zh.status,
    )
    check(
      `${name} zh preview message`,
      zh.preview?.startsWith('预览就绪') === true,
      zh.preview,
    )
    check(
      `${name} zh counted message`,
      zh.counter?.includes('个 HMR 模块') === true,
      zh.counter,
    )
    check(
      `${name} zh save state`,
      zh.save === '已保存到本地' ||
        zh.save === '保存中…' ||
        zh.save === '尚未保存',
      zh.save,
    )
    check(`${name} zh product title`, zh.title === 'Zeus Native Lab', zh.title)

    // 3. Dark theme: page tokens and the CodeMirror surface both change.
    await page.locator('[data-testid="theme-select"]').selectOption('dark')
    await page.waitForTimeout(250)
    const dark = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      surface: getComputedStyle(document.querySelector('.pg-toolbar')!)
        .backgroundColor,
      text: getComputedStyle(document.body).color,
      editorBg: getComputedStyle(document.querySelector('.cm-editor')!)
        .backgroundColor,
      editorFg: getComputedStyle(document.querySelector('.cm-content')!).color,
      // CodeMirror names its dark base class dynamically, so assert on a
      // surface the theme actually paints instead.
      gutterBg: getComputedStyle(document.querySelector('.cm-gutters')!)
        .backgroundColor,
      syntaxColors: [
        ...new Set(
          [...document.querySelectorAll('.cm-line span')]
            .slice(0, 40)
            .map(node => getComputedStyle(node).color),
        ),
      ],
      commentColor: (() => {
        const span = [...document.querySelectorAll('.cm-line span')].find(
          node =>
            node.textContent?.startsWith('//') ||
            node.textContent?.startsWith('import'),
        )
        return span ? getComputedStyle(span).color : undefined
      })(),
    }))
    check(`${name} dark applied`, dark.theme === 'dark', JSON.stringify(dark))
    check(`${name} dark body`, dark.bodyBg === 'rgb(31, 31, 31)', dark.bodyBg)
    check(
      `${name} dark toolbar`,
      dark.surface === 'rgb(24, 24, 24)',
      dark.surface,
    )
    check(`${name} dark text`, dark.text === 'rgb(204, 204, 204)', dark.text)
    check(
      `${name} dark editor surface`,
      dark.editorBg === 'rgb(31, 31, 31)',
      dark.editorBg,
    )
    check(
      `${name} dark editor text`,
      dark.editorFg === 'rgb(204, 204, 204)',
      dark.editorFg,
    )
    check(
      `${name} dark gutter`,
      dark.gutterBg === 'rgb(31, 31, 31)',
      dark.gutterBg,
    )
    check(
      `${name} dark syntax palette`,
      dark.syntaxColors.includes('rgb(86, 156, 214)'),
      dark.syntaxColors.join('|'),
    )

    // 4. Persistence and the pre-paint bootstrap.
    await page.reload({ waitUntil: 'domcontentloaded' })
    const prePaint = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      lang: document.documentElement.lang,
    }))
    check(`${name} prepaint dark`, prePaint.theme === 'dark', prePaint.theme)
    check(`${name} prepaint zh`, prePaint.lang === 'zh-CN', prePaint.lang)
    await waitReady(page)
    const persisted = await page.evaluate(() => {
      const state = window.__zeusPlayground!.getState()
      return {
        locale: state.locale,
        theme: state.theme,
        run: document
          .querySelector('[data-testid="compile"]')
          ?.textContent?.trim(),
      }
    })
    check(
      `${name} zh persisted`,
      persisted.locale === 'zh' && persisted.run === '运行',
      JSON.stringify(persisted),
    )
    check(`${name} dark persisted`, persisted.theme === 'dark', persisted.theme)

    // 5. Switching back restores English and light.
    await page.getByTestId('settings').click()
    await page.locator('[data-testid="locale-select"]').selectOption('en')
    await page.locator('[data-testid="theme-select"]').selectOption('light')
    await page.getByTestId('settings').click()
    await page.waitForTimeout(200)
    const restored = await page.evaluate(() => ({
      run: document
        .querySelector('[data-testid="compile"]')
        ?.textContent?.trim(),
      theme: document.documentElement.dataset.theme,
      tab: document.querySelector('.pg-result-tab')?.textContent?.trim(),
    }))
    check(
      `${name} back to English`,
      restored.run === 'Run' && restored.tab === 'Preview',
      JSON.stringify(restored),
    )
    check(`${name} back to light`, restored.theme === 'light', restored.theme)

    // 6. The example drawer is localized too.
    await page.getByTestId('examples').click()
    const drawerEn =
      (await page.getByTestId('example-native-counter').textContent()) ?? ''
    check(
      `${name} example English title`,
      drawerEn.includes('Signals Counter'),
      drawerEn,
    )
    await page.locator('.pg-drawer-footer button').last().click()
    await page.getByTestId('settings').click()
    await page.locator('[data-testid="locale-select"]').selectOption('zh')
    await page.getByTestId('settings').click()
    await page.getByTestId('examples').click()
    const drawerZh =
      (await page.getByTestId('example-native-counter').textContent()) ?? ''
    check(
      `${name} example Chinese title`,
      drawerZh.includes('Signal 计数器'),
      drawerZh,
    )
    await page.locator('.pg-drawer-footer button').last().click()

    // 7. The WebC product keeps the language and theme, and retitles the page.
    await page.evaluate(() =>
      window.__zeusPlayground!.selectProduct('webc-studio'),
    )
    await page.waitForTimeout(2_500)
    const webc = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      run: document
        .querySelector('[data-testid="compile"]')
        ?.textContent?.trim(),
      title: document.title,
      inspectorTab: [...document.querySelectorAll('.pg-result-tab')].map(tab =>
        tab.textContent?.trim(),
      ),
    }))
    check(`${name} webc zh run`, webc.run === '运行', JSON.stringify(webc))
    check(
      `${name} webc zh title`,
      webc.title === 'Zeus WebC Studio',
      webc.title,
    )
    check(
      `${name} webc zh inspector`,
      webc.inspectorTab.includes('组件检查'),
      webc.inspectorTab.join('|'),
    )

    // 8. A visitor from the previous deployment must not inherit its implicit
    //    dark default: v1 settings are ignored in favour of light/English.
    //    A fresh context keeps this isolated from the switches asserted above.
    const legacyContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    })
    const legacy = await legacyContext.newPage()
    await legacy.addInitScript(() => {
      localStorage.setItem(
        'zeus-playground.settings.v1',
        JSON.stringify({
          theme: 'dark',
          fontSize: 14,
          autoRun: true,
          splitPercent: 50,
          activeTab: 'preview',
        }),
      )
    })
    await legacy.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
    await waitReady(legacy)
    const upgraded = await legacy.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      lang: document.documentElement.lang,
      run: document
        .querySelector('[data-testid="compile"]')
        ?.textContent?.trim(),
      selects: [...document.querySelectorAll('.pg-popover select')].map(
        select => (select as HTMLSelectElement).dataset.testid,
      ),
    }))
    check(
      `${name} legacy v1 dark is not inherited`,
      upgraded.theme === 'light',
      JSON.stringify(upgraded),
    )
    check(
      `${name} legacy visitor gets English and the language switch`,
      upgraded.lang === 'en' &&
        upgraded.run === 'Run' &&
        upgraded.selects.includes('locale-select'),
      JSON.stringify(upgraded),
    )
    await legacyContext.close()

    check(
      `${name} no page errors`,
      pageErrors.length === 0,
      pageErrors.join('; '),
    )

    if (name === 'chromium') {
      await page.evaluate(() => localStorage.clear())
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
      await waitReady(page)
      await page.screenshot({ path: path.join(output, 'light-en.png') })
      await page.getByTestId('settings').click()
      await page.locator('[data-testid="theme-select"]').selectOption('dark')
      await page.locator('[data-testid="locale-select"]').selectOption('zh')
      await page.getByTestId('settings').click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(output, 'dark-zh.png') })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(output, 'dark-zh-mobile.png') })
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      )
      check(`${name} mobile zh has no overflow`, !overflow, String(overflow))
      const overflowingTabs = await page
        .locator('.pg-result-tabs')
        .evaluate(element => element.scrollWidth > element.clientWidth + 1)
      check(
        `${name} mobile zh tabs fit`,
        !overflowingTabs,
        String(overflowingTabs),
      )
      const namedButtons = await page
        .locator('button')
        .evaluateAll(buttons =>
          buttons.every(
            button =>
              (button.textContent ?? '').trim().length > 0 ||
              button.getAttribute('aria-label'),
          ),
        )
      check(
        `${name} mobile zh buttons named`,
        namedButtons === true,
        String(namedButtons),
      )
      // English and light are the shipped defaults again after a reset.
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.evaluate(() => localStorage.clear())
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitReady(page)
      const reset = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        lang: document.documentElement.lang,
      }))
      check(
        `${name} reset returns to light/en`,
        reset.theme === 'light' && reset.lang === 'en',
        JSON.stringify(reset),
      )
    }
  } finally {
    await page.close()
    await context.close()
  }
}

/**
 * The inline bootstrap is allowed by a CSP hash. Recompute it from the built
 * HTML so a whitespace edit or a new statement cannot silently disable the
 * pre-paint theme and reintroduce the flash.
 */
async function checkBootstrapHash(): Promise<void> {
  const { createHash } = await import('node:crypto')
  const nginx = await fs.readFile(
    path.join(root, 'examples/playground-editor/deploy/nginx.conf'),
    'utf8',
  )
  const declared = /sha256-([A-Za-z0-9+/=]+)/.exec(nginx)?.[1]
  for (const file of ['index.html', 'webc.html']) {
    const html = await fs.readFile(
      path.join(root, 'examples/playground-editor/dist', file),
      'utf8',
    )
    const body = /<script>\n([\s\S]*?)\n\s*<\/script>/.exec(html)?.[1]
    check(
      `${file} has an inline bootstrap`,
      body !== undefined,
      'no <script> block',
    )
    if (body === undefined) continue
    const actual = createHash('sha256').update(body).digest('base64')
    check(
      `${file} bootstrap hash matches nginx.conf`,
      actual === declared,
      `declared sha256-${declared ?? 'none'}, actual sha256-${actual}`,
    )
  }
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __zeusPlayground?: { getState(): { previewReady: boolean } }
        }
      ).__zeusPlayground?.getState().previewReady === true,
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
      const extension = path.extname(file)
      response.setHeader(
        'Content-Type',
        extension === '.html'
          ? 'text/html; charset=utf-8'
          : extension === '.js'
            ? 'text/javascript; charset=utf-8'
            : extension === '.css'
              ? 'text/css; charset=utf-8'
              : extension === '.wasm'
                ? 'application/wasm'
                : 'application/octet-stream',
      )
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>(resolve => server.listen(PORT, '0.0.0.0', resolve))
  return server
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
}

// No `declare global` here: sibling playground gates each declare their own
// Window shape, and merging a narrower one narrows theirs. Reads that run in
// the page use inline casts; Node-side reads use `page.evaluate`.

void main()
