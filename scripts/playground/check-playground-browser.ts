import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { chromium, expect, firefox, webkit } from '@playwright/test'

import type { Page } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/playground')
const directory = path.join(root, 'docs/public/playground')
const html = await fs.readFile(path.join(directory, 'index.html'))
const json = await fs.readFile(path.join(directory, 'counter.json'))
const sample = JSON.parse(json.toString()) as {
  source: string
  dom: string
  ssr: string
  ir: unknown
  diagnostics: unknown
  bundleSize: { dom: { raw: number }; ssr: { raw: number } }
}
const prefix = '/zeus/playground/'
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (pathname === prefix || pathname === `${prefix}index.html`) {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(html)
  } else if (pathname === `${prefix}counter.json`) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(json)
  } else {
    response.writeHead(404).end()
  }
})
await fs.mkdir(output, { recursive: true })
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
const url = `http://127.0.0.1:${address.port}${prefix}`
const results: Array<{ browser: string; status: string; error?: string }> = []
const views = ['dom', 'ssr', 'ir', 'diagnostics', 'size'] as const

async function ready(page: Page) {
  await expect(page.locator('#panel')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('#copy-source')).toBeEnabled()
}

async function checkView(page: Page, view: (typeof views)[number]) {
  await expect(page.locator(`#tab-${view}`)).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('#panel')).toHaveAttribute(
    'aria-labelledby',
    `tab-${view}`,
  )
  expect(new URL(page.url()).searchParams.get('view')).toBe(view)
  if (view === 'size') {
    await expect(page.locator('#output')).toBeHidden()
    await expect(page.locator('#size-view .sizes section')).toHaveCount(4)
    await expect(page.locator('#size-view')).toContainText('Rolldown')
    await expect(page.locator('#size-view')).toContainText('production')
    await expect(page.locator('#size-view')).toContainText(
      '全部传递 runtime 包依赖',
    )
    const sections = page.locator('#size-view .sizes section')
    for (const [index, target] of ['dom', 'ssr'].entries()) {
      const size = sample.bundleSize[target as 'dom' | 'ssr'].raw
      await expect(sections.nth(index).locator('td').first()).toHaveText(
        `${size.toLocaleString('en-US')} B`,
      )
    }
  } else {
    const expected =
      view === 'ir' || view === 'diagnostics'
        ? JSON.stringify(sample[view], null, 2)
        : sample[view]
    await expect(page.locator('#output')).toBeVisible()
    // textContent preserves compiler whitespace and final newlines exactly.
    expect(await page.locator('#output code').textContent()).toBe(expected)
  }
}

async function pasteClipboard(page: Page) {
  // Use the real browser clipboard. No mock is installed on the success path.
  const probe = page.locator('#clipboard-probe')
  if (!(await probe.count())) {
    await page.evaluate(() => {
      const textarea = document.createElement('textarea')
      textarea.id = 'clipboard-probe'
      textarea.setAttribute('aria-label', 'Clipboard smoke probe')
      document.body.append(textarea)
    })
  }
  await probe.fill('')
  await probe.focus()
  await page.keyboard.press('ControlOrMeta+V')
  await expect(probe).not.toHaveValue('')
  return probe.inputValue()
}

try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' ? { channel: 'chromium' } : {}),
    })
    const errors: string[] = []
    const newPage = async () => {
      const page = await browser.newPage()
      page.setDefaultTimeout(10_000)
      page.on('pageerror', error => errors.push(error.message))
      return page
    }
    try {
      const page = await newPage()
      let release: () => void = () => {}
      const loading = new Promise<void>(resolve => {
        release = resolve
      })
      await page.route('**/counter.json', async route => {
        await loading
        await route.continue()
      })
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('status')).toHaveText('正在加载编译样例…')
        await expect(page.locator('#panel')).toHaveAttribute(
          'aria-busy',
          'true',
        )
        await expect(page.locator('#copy-source')).toBeDisabled()
        await expect(page.locator('#copy-share')).toBeDisabled()
      } finally {
        release()
      }
      await ready(page)
      await page.unroute('**/counter.json')
      expect(await page.locator('#source').textContent()).toBe(sample.source)
      await page.locator('#copy-source').click()
      await expect(page.getByRole('status')).toHaveText('TSX 源码已复制。')
      expect(await pasteClipboard(page)).toBe(sample.source)

      for (const view of views) {
        await page.locator(`#tab-${view}`).click()
        await checkView(page, view)
        await page.locator('#copy-share').click()
        await expect(page.getByRole('status')).toHaveText(
          '分享链接已复制，可恢复当前视图。',
        )
        const shared = await pasteClipboard(page)
        expect(shared).toBe(
          await page.locator('#share-link').getAttribute('href'),
        )
        expect(new URL(shared).pathname).toBe(prefix)
        expect(new URL(shared).searchParams.get('view')).toBe(view)
        await page.goto(shared)
        await ready(page)
        await checkView(page, view)
        await page.reload()
        await ready(page)
        await checkView(page, view)
      }
      // Tab navigation uses one roving tab stop and standard arrow/Home/End keys.
      await page.locator('#tab-size').focus()
      for (const [key, view] of [
        ['Home', 'dom'],
        ['ArrowRight', 'ssr'],
        ['End', 'size'],
        ['ArrowRight', 'dom'],
        ['ArrowLeft', 'size'],
      ] as const) {
        await page.keyboard.press(key)
        await expect(page.locator(`#tab-${view}`)).toBeFocused()
        await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1)
        await checkView(page, view)
      }
      await page.screenshot({
        path: path.join(output, `${name}.png`),
        fullPage: true,
      })
      await page.close()

      const failure = await newPage()
      await failure.route('**/counter.json', route =>
        route.fulfill({ status: 503, body: 'Unavailable' }),
      )
      await failure.goto(url)
      await expect(failure.getByRole('status')).toContainText('样例加载失败')
      await expect(failure.locator('#panel')).toHaveAttribute(
        'aria-busy',
        'false',
      )
      await expect(failure.locator('#copy-source')).toBeDisabled()
      await failure.unroute('**/counter.json')
      await failure.getByRole('button', { name: '重新加载样例' }).click()
      await ready(failure)
      await failure.close()

      const denied = await newPage()
      await denied.addInitScript(`
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { async writeText() { throw new DOMException('Denied', 'NotAllowedError') } },
        })
      `)
      await denied.goto(`${url}?view=ir`)
      await ready(denied)
      for (const [button, value] of [
        ['#copy-source', sample.source],
        ['#copy-share', `${url}?view=ir`],
      ]) {
        await denied.locator(button).click()
        await expect(denied.getByRole('status')).toContainText(
          '请按 Ctrl/Cmd+C 手动复制',
        )
        const fallback = denied.locator('#copy-text')
        await expect(fallback).toHaveValue(value)
        await expect(fallback).toBeFocused()
        expect(
          await fallback.evaluate((element: HTMLTextAreaElement) => [
            element.selectionStart,
            element.selectionEnd,
          ]),
        ).toEqual([0, value.length])
        await denied.keyboard.press('ControlOrMeta+C')
        expect(await pasteClipboard(denied)).toBe(value)
      }
      await denied.close()

      const stalledClipboard = await newPage()
      await stalledClipboard.addInitScript(`
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText() { return new Promise(() => {}) } },
        })
      `)
      await stalledClipboard.goto(`${url}?view=unknown`)
      await ready(stalledClipboard)
      await expect(stalledClipboard.getByRole('status')).toContainText(
        '未知视图，已显示 DOM JS',
      )
      await checkView(stalledClipboard, 'dom')
      await stalledClipboard.locator('#copy-source').click()
      await expect(stalledClipboard.getByRole('status')).toContainText(
        '请按 Ctrl/Cmd+C 手动复制',
      )
      await expect(stalledClipboard.locator('#copy-text')).toHaveValue(
        sample.source,
      )
      await stalledClipboard.close()
      expect(errors).toEqual([])
      results.push({ browser: name, status: 'passed' })
      console.log(
        `Playground ${name}: views, real clipboard, sharing and failure paths passed`,
      )
    } catch (error) {
      results.push({ browser: name, status: 'failed', error: String(error) })
    } finally {
      await browser.close()
    }
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  await fs.writeFile(
    path.join(output, 'browser-report.json'),
    `${JSON.stringify(
      {
        scope:
          'static compiled fixture, all views, real clipboard, shared URLs/reload, keyboard, loading, retry and denied clipboard',
        versions: {
          node: process.version,
          zlib: process.versions.zlib,
          brotli: process.versions.brotli,
        },
        results,
      },
      null,
      2,
    )}\n`,
  )
}
assert(
  results.length === 3 && results.every(result => result.status === 'passed'),
  JSON.stringify(results),
)
console.log('Playground passed in Chromium, Firefox and WebKit')
