import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { chromium, expect, firefox, webkit } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/hydration')
const runtime = await fs.readFile(
  path.join(root, 'packages/core/zeus/dist/zeus.esm-browser.js'),
)
// Run plain Node so tsx's workspace aliases cannot replace published imports.
const html = execFileSync(
  process.execPath,
  [path.join(root, 'scripts/testing/hydration-server.mjs')],
  { encoding: 'utf8', cwd: root },
)
const client = `
import { createSignal, hydrate } from '/runtime.js'
const main = document.querySelector('main')
const input = main.querySelector('input')
const initialInput = input
const initialButton = main.querySelector('button')
let dispose
let disposeShadow
let setCount
let setName
let setLabel
window.hydrationSmoke = {
  start() {
    const [count, updateCount] = createSignal(0)
    const [name, updateName] = createSignal(input.value)
    const [label, updateLabel] = createSignal('Client shadow')
    setCount = updateCount
    setName = updateName
    setLabel = updateLabel
    dispose = hydrate(main, context => {
      context.node('input', 'input')
      context.node('button', 'button')
      context.prop('input', 'value', name)
      context.attr('input', 'data-hydrated', () => 'yes')
      context.text('count', count)
      context.event('button', 'click', () => updateCount(count() + 1))
      context.event('input', 'input', () => updateName(input.value))
    })
    disposeShadow = hydrate(document.querySelector('z-ssr-card').shadowRoot, context => {
      context.node('shadow-text', 'strong')
      context.text('label', label)
    })
    return main.querySelector('input') === initialInput && main.querySelector('button') === initialButton
  },
  mismatch() {
    try { hydrate(main, context => context.node('input', 'textarea')) }
    catch (error) { return error.message }
    throw new Error('Expected hydration mismatch')
  },
  update() { setCount(7); setName('Client'); setLabel('Updated shadow') },
  dispose() { dispose(); disposeShadow() },
  updateAfterDispose() { setCount(99); setName('Leaked'); setLabel('Leaked') }
}
`
const server = http.createServer((request, response) => {
  const script = request.url === '/runtime.js' ? runtime : client
  if (request.url === '/runtime.js' || request.url === '/client.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(script)
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hydration acceptance</title></head><body>${html}<script type="module" src="/client.js"></script></body></html>`,
    )
  } else {
    response.writeHead(404).end()
  }
})
await fs.mkdir(output, { recursive: true })
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`
const results: Array<{ browser: string; status: string; error?: string }> = []
type Smoke = {
  start(): boolean
  mismatch(): string
  update(): void
  dispose(): void
  updateAfterDispose(): void
}
declare global {
  interface Window {
    hydrationSmoke: Smoke
  }
}

try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' ? { channel: 'chromium' } : {}),
    })
    try {
      // Server HTML and native DSD must work without running any application JS.
      const staticPage = await browser.newPage({ javaScriptEnabled: false })
      await staticPage.goto(origin)
      await expect(
        staticPage.getByRole('textbox', { name: 'Name' }),
      ).toHaveValue('Server')
      await expect(staticPage.locator('z-ssr-card strong')).toHaveText(
        'Server shadow',
      )
      await expect(staticPage.locator('z-ssr-card')).toHaveAttribute(
        'title',
        'Server card',
      )
      expect(
        await staticPage
          .locator('z-ssr-card slot')
          .evaluate(node =>
            (node as HTMLSlotElement)
              .assignedNodes()
              .map(assigned => assigned.textContent),
          ),
      ).toEqual(['Projected details'])
      await staticPage.close()

      const page = await browser.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin)
      await page.waitForFunction(() => !!window.hydrationSmoke)
      const input = page.getByRole('textbox', { name: 'Name' })
      await input.fill('Typed before hydration')
      await input.evaluate((node: HTMLInputElement) =>
        node.setSelectionRange(2, 8),
      )
      expect(await page.evaluate(() => window.hydrationSmoke.start())).toBe(
        true,
      )
      await expect(input).toBeFocused()
      await expect(input).toHaveValue('Typed before hydration')
      expect(
        await input.evaluate((node: HTMLInputElement) => [
          node.selectionStart,
          node.selectionEnd,
        ]),
      ).toEqual([2, 8])
      expect(
        await page.evaluate(() => window.hydrationSmoke.mismatch()),
      ).toContain('ZEUS_HYDRATION_TAG_MISMATCH')
      await expect(input).toBeFocused()
      await page.getByRole('button', { name: 'Increment' }).click()
      await expect(page.locator('output')).toHaveText('1')
      await page.evaluate(() => window.hydrationSmoke.update())
      await expect(input).toHaveValue('Client')
      await expect(page.locator('output')).toHaveText('7')
      await expect(page.locator('z-ssr-card strong')).toHaveText(
        'Updated shadow',
      )
      await page.evaluate(() => {
        window.hydrationSmoke.dispose()
        window.hydrationSmoke.updateAfterDispose()
      })
      await page.getByRole('button', { name: 'Increment' }).click()
      await expect(page.locator('output')).toHaveText('7')
      await expect(input).toHaveValue('Client')
      await expect(page.locator('z-ssr-card strong')).toHaveText(
        'Updated shadow',
      )
      expect(errors).toEqual([])
      await page.screenshot({ path: path.join(output, `${name}.png`) })
      results.push({ browser: name, status: 'passed' })
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
    path.join(output, 'report.json'),
    `${JSON.stringify({ scope: 'built artifacts, explicit hydration plan', results }, null, 2)}\n`,
  )
}
assert(
  results.length === 3 && results.every(result => result.status === 'passed'),
  JSON.stringify(results),
)
console.log('SSR/explicit hydration passed in Chromium, Firefox and WebKit')
