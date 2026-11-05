import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import {
  chromium,
  firefox,
  webkit,
  type BrowserContext,
} from '@playwright/test'

declare global {
  interface Window {
    runCleanupFixture(): Promise<{
      mounts: number
      clicks: number
      detachedClicks: number
      cycles: number
      reparentClicks: number
      reparentMounts: number
      reparentDetachedClicks: number
      finalConnected: boolean
    }>
    runHeapFixture(cycles: number): Promise<number>
  }
}

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/runtime-cleanup-browser')
const runtime = await fs.readFile(
  path.join(root, 'packages/core/runtime-dom/dist/runtime-dom.esm-browser.js'),
)
const tag = `z-cleanup-check-${Date.now().toString(36)}`
const heapTag = `${tag}-heap`

const page = `<!doctype html>
<meta charset="utf-8">
<script type="module">
import { bindEvent, defineElement } from '/runtime.js'

let mounts = 0
let clicks = 0
let detachedClicks = 0
let reparentMounts = 0
let reparentClicks = 0
let reparentDetachedClicks = 0
let heapMounts = 0
const buttons = []
const reparentButtons = []

defineElement(${JSON.stringify(tag)}, {}, () => {
  mounts++
  const button = document.createElement('button')
  bindEvent(button, 'click', () => clicks++, false)
  buttons.push(button)
  return button
})

defineElement(${JSON.stringify(tag + '-reparent')}, {}, () => {
  reparentMounts++
  const button = document.createElement('button')
  bindEvent(button, 'click', () => reparentClicks++, false)
  reparentButtons.push(button)
  return button
})

defineElement(${JSON.stringify(heapTag)}, {}, () => {
  heapMounts++
  const root = document.createElement('div')
  const button = document.createElement('button')
  bindEvent(button, 'click', () => {}, false)
  root.append(button)
  return root
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

  const connectedHost = document.createElement(${JSON.stringify(tag)})
  document.body.append(connectedHost)
  await frame()
  for (let cycle = 0; cycle < 50; cycle++) {
    connectedHost.remove()
    await Promise.resolve()
    document.body.append(connectedHost)
    await frame()
  }

  const left = document.createElement('section')
  const right = document.createElement('section')
  document.body.append(left, right)
  const reparentHost = document.createElement(${JSON.stringify(tag + '-reparent')})
  left.append(reparentHost)
  await frame()
  const beforeReparent = reparentClicks
  reparentButtons[0].click()
  right.append(reparentHost)
  await frame()
  reparentButtons[reparentButtons.length - 1].click()
  const detachedButton = reparentButtons[reparentButtons.length - 1]
  reparentHost.remove()
  await frame()
  const beforeDetached = reparentClicks
  detachedButton.click()
  reparentDetachedClicks = reparentClicks - beforeDetached

  return {
    mounts,
    clicks,
    detachedClicks,
    cycles: 50,
    reparentClicks: reparentClicks - beforeReparent,
    reparentMounts,
    reparentDetachedClicks,
    finalConnected: connectedHost.isConnected,
  }
}

window.runHeapFixture = async cycles => {
  const frame = () =>
    new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  for (let cycle = 0; cycle < cycles; cycle++) {
    const host = document.createElement(${JSON.stringify(heapTag)})
    document.body.append(host)
    await frame()
    host.remove()
    await frame()
  }
  return heapMounts
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
interface HeapEvidence {
  before: number
  after: number
  growth: number
  cycles: number
  mounts: number
}
const results: Array<{
  browser: string
  status: string
  error?: string
  heap?: HeapEvidence
}> = []

try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    let browser
    try {
      browser = await engine.launch({
        headless: true,
        ...(name === 'chromium' ? { channel: 'chromium' } : {}),
      })
      const context = await browser.newContext()
      const tab = await context.newPage()
      const errors: string[] = []
      tab.on('pageerror', error => errors.push(error.message))
      await tab.goto(origin)
      await tab.waitForFunction(
        () => typeof window.runCleanupFixture === 'function',
      )
      const actual = await tab.evaluate(() => window.runCleanupFixture())
      assert.deepEqual(actual, {
        mounts: 53,
        clicks: 2,
        detachedClicks: 0,
        cycles: 50,
        reparentClicks: 2,
        reparentMounts: 2,
        reparentDetachedClicks: 0,
        finalConnected: true,
      })
      assert.deepEqual(errors, [])
      const heap =
        name === 'chromium'
          ? await measureChromiumHeap(context, origin)
          : undefined
      results.push({ browser: name, status: 'passed', heap })
      await context.close()
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

async function measureChromiumHeap(
  context: BrowserContext,
  origin: string,
): Promise<HeapEvidence> {
  const page = await context.newPage()
  try {
    await page.goto(origin)
    await page.waitForFunction(
      () => typeof window.runHeapFixture === 'function',
    )
    const session = await context.newCDPSession(page)
    await session.send('HeapProfiler.enable')
    await page.evaluate(() => window.runHeapFixture(20))
    await session.send('HeapProfiler.collectGarbage')
    const before = (await session.send('Runtime.getHeapUsage')).usedSize
    const mounts = await page.evaluate(() => window.runHeapFixture(80))
    await session.send('HeapProfiler.collectGarbage')
    const after = (await session.send('Runtime.getHeapUsage')).usedSize
    const growth = after - before
    assert.ok(
      growth < 2 * 1024 * 1024,
      `Chromium heap grew by ${growth} bytes after 80 cleanup cycles`,
    )
    assert.ok(mounts >= 100, `Expected 100 heap mounts, received ${mounts}`)
    return { before, after, growth, cycles: 80, mounts }
  } finally {
    await page.close()
  }
}
