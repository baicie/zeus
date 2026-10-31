import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { chromium, firefox, webkit } from '@playwright/test'

declare global {
  interface Window {
    runCleanupFixture(): Promise<{
      mounts: number
      clicks: number
      detachedClicks: number
    }>
  }
}

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/runtime-cleanup-browser')
const runtime = await fs.readFile(
  path.join(root, 'packages/core/runtime-dom/dist/runtime-dom.esm-browser.js'),
)
const tag = `z-cleanup-check-${Date.now().toString(36)}`

const page = `<!doctype html>
<meta charset="utf-8">
<script type="module">
import { bindEvent, defineElement } from '/runtime.js'

let mounts = 0
let clicks = 0
let detachedClicks = 0
const buttons = []

defineElement(${JSON.stringify(tag)}, {}, () => {
  mounts++
  const button = document.createElement('button')
  bindEvent(button, 'click', () => clicks++, false)
  buttons.push(button)
  return button
})

window.runCleanupFixture = async () => {
  const host = document.createElement(${JSON.stringify(tag)})
  document.body.append(host)
  const frame = () =>
    new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )

  await frame()
  buttons[0].click()
  host.remove()
  await frame()
  const beforeDetachedClick = clicks
  buttons[0].click()
  detachedClicks = clicks - beforeDetachedClick

  document.body.append(host)
  await frame()
  buttons[1].click()
  host.remove()
  await frame()

  return { mounts, clicks, detachedClicks }
}
</script>`

const server = http.createServer((request, response) => {
  if (request.url === '/runtime.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(runtime)
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
const results: Array<{ browser: string; status: string; error?: string }> = []

try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    let browser
    try {
      browser = await engine.launch({
        headless: true,
        ...(name === 'chromium' ? { channel: 'chromium' } : {}),
      })
      const tab = await browser.newPage()
      const errors: string[] = []
      tab.on('pageerror', error => errors.push(error.message))
      await tab.goto(origin)
      await tab.waitForFunction(
        () => typeof window.runCleanupFixture === 'function',
      )
      const actual = await tab.evaluate(() => window.runCleanupFixture())
      assert.deepEqual(actual, { mounts: 2, clicks: 2, detachedClicks: 0 })
      assert.deepEqual(errors, [])
      results.push({ browser: name, status: 'passed' })
    } catch (error) {
      results.push({
        browser: name,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
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
    `${JSON.stringify(results, null, 2)}\n`,
  )
}

for (const result of results) {
  if (result.status === 'failed') {
    throw new Error(
      `${result.browser} runtime cleanup browser check failed: ${result.error}`,
    )
  }
}

console.log(JSON.stringify(results, null, 2))
