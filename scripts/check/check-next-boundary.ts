import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium, expect, firefox, webkit } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const app = path.join(root, 'examples/next-boundary')
const output = path.join(root, 'temp/next-boundary')
fs.mkdirSync(output, { recursive: true })
execFileSync('pnpm', ['build'], {
  cwd: app,
  stdio: 'inherit',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
})

const reservation = net.createServer()
await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
const address = reservation.address()
assert(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`
await new Promise<void>((resolve, reject) =>
  reservation.close(error => (error ? reject(error) : resolve())),
)
const log = fs.openSync(path.join(output, 'server.log'), 'w')
const server = spawn(
  process.execPath,
  [
    path.join(app, 'node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(address.port),
  ],
  {
    cwd: app,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', log, log],
  },
)
const exited = new Promise<void>(resolve =>
  server.once('exit', () => resolve()),
)
let serverError: Error | undefined
server.once('error', error => {
  serverError = error
})
const results: Array<{ browser: string; status: string; error?: string }> = []

try {
  const deadline = Date.now() + 60000
  while (true) {
    if (serverError) throw serverError
    if (server.exitCode !== null) {
      throw new Error('Next server exited; see temp/next-boundary/server.log')
    }
    const response = await fetch(origin).catch(() => undefined)
    if (response?.ok) break
    if (Date.now() >= deadline)
      throw new Error('Next server did not become ready')
    await delay(100)
  }

  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' ? { channel: 'chromium' } : {}),
    })
    try {
      const staticPage = await browser.newPage({ javaScriptEnabled: false })
      await staticPage.goto(origin)
      const staticHost = staticPage
        .getByRole('region', { name: '服务端静态宿主' })
        .locator('z-next-counter')
      await expect(staticHost).toHaveAttribute('count', '2')
      await expect(staticHost).toHaveText('服务端内容')
      expect(await staticHost.evaluate(node => node.shadowRoot === null)).toBe(
        true,
      )
      await expect(
        staticPage
          .getByRole('region', { name: '客户端交互' })
          .locator('z-next-counter'),
      ).toHaveAttribute('count', '1')
      await staticPage.close()

      const page = await browser.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => {
        if (
          message.type() === 'error' &&
          /hydration|hydrating|mismatch|#41[89]|#42[0-9]/i.test(message.text())
        ) {
          errors.push(message.text())
        }
      })
      // Save server host identity before Next and the generated loader execute.
      await page.addInitScript(() => {
        new MutationObserver((_, observer) => {
          const host = document.querySelector('z-next-counter')
          if (host) {
            Object.defineProperty(window, '__NEXT_HOST__', { value: host })
            observer.disconnect()
          }
        }).observe(document, { childList: true, subtree: true })
      })
      await page.goto(origin)
      const interactive = page.getByRole('region', { name: '客户端交互' })
      await interactive.getByRole('button', { name: /交互计数.*1/ }).click()
      await expect(page.getByRole('status', { name: 'React 状态' })).toHaveText(
        '2',
      )
      await interactive.getByRole('button', { name: /交互计数.*2/ }).click()
      await expect(page.getByRole('status', { name: 'React 状态' })).toHaveText(
        '3',
      )
      await expect(interactive.locator('z-next-counter')).toHaveAttribute(
        'count',
        '3',
      )
      await expect(
        page
          .getByRole('region', { name: '服务端静态宿主' })
          .getByRole('button'),
      ).toHaveText('服务端内容: 2')
      expect(
        await page.evaluate(
          () =>
            document.querySelector('z-next-counter') ===
            (window as unknown as { __NEXT_HOST__: Element }).__NEXT_HOST__,
        ),
      ).toBe(true)
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
  if (server.exitCode === null) server.kill('SIGTERM')
  if (!serverError) await exited
  fs.closeSync(log)
  fs.writeFileSync(
    path.join(output, 'report.json'),
    `${JSON.stringify(
      {
        scope: 'Next.js production server, workspace-generated wrappers',
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
console.log(
  'Next Server/Client boundary passed in Chromium, Firefox and WebKit',
)
