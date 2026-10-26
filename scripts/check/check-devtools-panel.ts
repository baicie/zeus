import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium, expect, firefox, webkit } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/devtools-panel')
await fs.mkdir(output, { recursive: true })
execFileSync('pnpm', ['-F', '@zeus-js/example-devtools-panel', 'build'], {
  cwd: root,
  stdio: 'inherit',
})

// Runtime instrumentation is intentionally dev-only. Build first to prove the
// production graph compiles, then drive the real development server for the
// click-to-binding acceptance.
const reservation = net.createServer()
await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
const reserved = reservation.address()
assert(reserved && typeof reserved !== 'string')
const port = reserved.port
await new Promise<void>((resolve, reject) =>
  reservation.close(error => (error ? reject(error) : resolve())),
)
const serverLog = await fs.open(path.join(output, 'server.log'), 'w')
const devServer = spawn(
  'pnpm',
  [
    '-F',
    '@zeus-js/example-devtools-panel',
    'dev',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  {
    cwd: root,
    stdio: ['ignore', serverLog.fd, serverLog.fd],
  },
)
const exited = new Promise<void>(resolve =>
  devServer.once('exit', () => resolve()),
)
let serverError: Error | undefined
devServer.once('error', error => {
  serverError = error
})
const url = `http://127.0.0.1:${port}/`
const results: Array<{
  browser: string
  status: string
  error?: string
  pageErrors: string[]
  failedResponses: Array<{ url: string; status: number }>
}> = []

try {
  const deadline = Date.now() + 30000
  while (true) {
    if (serverError) throw serverError
    if (devServer.exitCode !== null) {
      throw new Error('Vite development server exited before becoming ready')
    }
    if ((await fetch(url).catch(() => undefined))?.ok) break
    if (Date.now() >= deadline)
      throw new Error('Vite development server did not start')
    await delay(100)
  }

  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
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
            devtoolsSmoke: { snapshot: () => { eventCount: number } }
          }
        ).devtoolsSmoke
        return smoke.snapshot()
      })
      expect(initialSnapshot.eventCount).toBeGreaterThan(0)
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
  if (devServer.exitCode === null) devServer.kill('SIGTERM')
  if (!serverError) await exited
  await serverLog.close()
  await fs.writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify({ scope: 'real runtime events, click DOM selection, panel graph', results }, null, 2)}\n`,
  )
}
assert(
  results.length === 3 && results.every(result => result.status === 'passed'),
  JSON.stringify(results),
)
console.log('DevTools panel passed in Chromium, Firefox and WebKit')
