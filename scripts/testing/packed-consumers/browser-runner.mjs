import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { chromium, firefox, webkit } from '@playwright/test'

const [directory, mode, engine] = process.argv.slice(2)
const browserType = { chromium, firefox, webkit }[engine]
assert(browserType, `Unsupported browser engine: ${engine}`)
process.env.ZEUS_CONSUMER_MODE = mode
const require = createRequire(path.join(directory, 'package.json'))
const { preview } = await import(pathToFileURL(require.resolve('vite')))
const server = await preview({
  root: directory,
  configFile: path.join(directory, 'vite.config.mjs'),
  preview: { host: '127.0.0.1', port: 0 },
})
let browser
try {
  browser = await browserType.launch({
    headless: true,
    ...(engine === 'chromium' ? { channel: 'chromium' } : {}),
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  const address = server.httpServer.address()
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.waitForFunction(() => window.packedResult, undefined, {
    timeout: 30_000,
  })
  const result = await page.evaluate(() => window.packedResult)
  assert.equal(result.passed, true, JSON.stringify({ result, errors }))
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({ ...result, engine, browserVersion: browser.version() }),
  )
} finally {
  await browser?.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
