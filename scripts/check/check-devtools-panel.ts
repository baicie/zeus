import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { chromium, expect, firefox, webkit } from '@playwright/test'
import { build, createServer } from 'vite'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/devtools-panel')
const browserNames = (
  process.env.ZEUS_DEVTOOLS_BROWSERS ?? 'chromium,firefox,webkit'
).split(',')
const browsers = { chromium, firefox, webkit }
await fs.mkdir(output, { recursive: true })
const exampleRoot = path.join(root, 'examples/devtools-panel')
await build({ root: exampleRoot })
const productionRuntime = await fs.readFile(
  path.join(
    root,
    'packages/core/runtime-dom/dist/runtime-dom.esm-browser.prod.js',
  ),
  'utf8',
)
assert.equal(productionRuntime.includes('custom-element:connect'), false)
assert.equal(productionRuntime.includes('custom-element:disconnect'), false)
assert.equal(productionRuntime.includes('hmr:patch'), false)
assert.equal(productionRuntime.includes('hmr:invalidate'), false)
assert.equal(productionRuntime.includes('hmr:dispose'), false)

// Runtime instrumentation is intentionally dev-only. Build first to prove the
// production graph compiles, then drive the real development server for the
// click-to-binding acceptance.
const devServer = await createServer({
  root: exampleRoot,
  server: { host: '127.0.0.1', port: 0 },
})
const results: Array<{
  browser: string
  status: string
  error?: string
  pageErrors: string[]
  failedResponses: Array<{ url: string; status: number }>
}> = []

try {
  await devServer.listen()
  const address = devServer.httpServer?.address()
  assert(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}/`

  for (const name of browserNames) {
    const engine = browsers[name as keyof typeof browsers]
    if (!engine) throw new Error(`Unknown browser engine: ${name}`)
    const browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' ? { channel: 'chromium' } : {}),
    })
    const errors: string[] = []
    const failedResponses: Array<{ url: string; status: number }> = []
    try {
      const page = await browser.newPage()
      page.on('pageerror', error => errors.push(error.message))
      page.on('response', response => {
        if (response.status() >= 400)
          failedResponses.push({
            url: response.url(),
            status: response.status(),
          })
      })
      await page.goto(url)
      const counter = page.getByTestId('counter')
      await expect(counter).toHaveText('Count: 0')
      const initialSnapshot = await page.evaluate(() => {
        const smoke = (
          window as unknown as {
            devtoolsSmoke: {
              snapshot: () => {
                eventCount: number
                customElements: Array<{
                  name: string
                  connected: boolean
                  mountCount: number
                }>
                timeline: Array<{ type: string; reason?: string }>
              }
            }
          }
        ).devtoolsSmoke
        return smoke.snapshot()
      })
      expect(initialSnapshot.eventCount).toBeGreaterThan(0)
      expect(initialSnapshot.customElements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'z-devtools-card',
            connected: true,
            mountCount: 1,
          }),
          expect.objectContaining({
            name: 'z-devtools-shadow-card',
            connected: true,
            mountCount: 1,
          }),
        ]),
      )
      expect(initialSnapshot.timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'custom-element:connect' }),
        ]),
      )
      const panel = page.locator('#devtools')
      await expect(panel.locator('[data-zeus-devtools-summary]')).toContainText(
        /([1-9]\d*) bindings/,
      )
      await expect(panel.locator('[data-zeus-devtools-summary]')).toContainText(
        /([1-9]\d*) signals/,
      )

      await counter.click()
      await expect(counter).toHaveText('Count: 1')
      const selected = panel.locator('[data-zeus-devtools-section="selection"]')
      await expect(selected).toContainText('bindings')
      await expect(selected).toContainText('signals')
      await expect(
        panel.locator('[data-zeus-devtools-section="effects"]'),
      ).toContainText('runs')
      await expect(
        panel.locator('[data-zeus-devtools-section="bindings"]'),
      ).toContainText('dynamic-region')
      await expect(
        panel.locator('[data-zeus-devtools-section="custom-elements"]'),
      ).toContainText('z-devtools-card')
      await expect(
        panel.locator('[data-zeus-devtools-section="custom-elements"]'),
      ).toContainText('z-devtools-shadow-card')
      await expect(
        panel.locator('[data-zeus-devtools-section="timeline"]'),
      ).toContainText('custom-element:connect')
      await expect(
        panel.locator('[data-zeus-devtools-section="timeline"]'),
      ).toContainText(/t\+/)
      await expect(page.getByTestId('secondary-root')).toHaveText(
        'Secondary root: 1',
      )
      await expect(page.getByTestId('shadow-card')).toContainText('Shadow root')
      expect(
        await page
          .locator('z-devtools-shadow-card')
          .evaluate(element => Boolean(element.shadowRoot)),
      ).toBe(true)
      await page.getByTestId('shadow-counter').click()
      await expect(page.getByTestId('shadow-counter')).toHaveText(
        'Shadow count: 1',
      )
      await expect(
        panel.locator('[data-zeus-devtools-section="selection"]'),
      ).toContainText('bindings')
      await page.evaluate(() => {
        ;(
          window as unknown as { devtoolsSmoke: { toggleWebComponent(): void } }
        ).devtoolsSmoke.toggleWebComponent()
      })
      await expect(
        panel.locator('[data-zeus-devtools-section="custom-elements"]'),
      ).toContainText('disconnected')
      await page.evaluate(() => {
        ;(
          window as unknown as { devtoolsSmoke: { toggleWebComponent(): void } }
        ).devtoolsSmoke.toggleWebComponent()
      })
      await expect(
        panel.locator('[data-zeus-devtools-section="custom-elements"]'),
      ).toContainText('mounts 2')
      expect(errors).toEqual([])
      await page.screenshot({
        path: path.join(output, `${name}.png`),
        fullPage: true,
      })
      results.push({
        browser: name,
        status: 'passed',
        pageErrors: errors,
        failedResponses,
      })
    } catch (error) {
      results.push({
        browser: name,
        status: 'failed',
        error: String(error),
        pageErrors: errors,
        failedResponses,
      })
    } finally {
      await browser.close()
    }
  }
} finally {
  try {
    await fs.writeFile(
      path.join(output, 'report.json'),
      `${JSON.stringify({ scope: 'real runtime events, bounded timeline, Custom Element lifecycle, shadow-root selection and panel graph', productionRuntimeInstrumentation: false, results }, null, 2)}\n`,
    )
  } finally {
    const httpServer = devServer.httpServer
    if (httpServer && 'closeAllConnections' in httpServer) {
      httpServer.closeAllConnections()
    }
    await devServer.close()
  }
}
assert(
  results.length === browserNames.length &&
    results.every(result => result.status === 'passed'),
  JSON.stringify(results),
)
console.log(`DevTools panel passed in ${browserNames.join(', ')}`)
