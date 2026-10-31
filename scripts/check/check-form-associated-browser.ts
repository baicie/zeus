import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { chromium, firefox, webkit } from '@playwright/test'

declare global {
  interface Window {
    runFormFixture(): Promise<{
      initial: string | null
      updated: string | null
      associated: number
      disabled: boolean[]
      reset: number
      labelled: boolean
      labelClicks: number
    }>
  }
}

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/form-associated-browser')
const runtime = await fs.readFile(
  path.join(root, 'packages/core/runtime-dom/dist/runtime-dom.esm-browser.js'),
)
const tag = `z-form-check-${Date.now().toString(36)}`

const page = `<!doctype html>
<meta charset="utf-8">
<script type="module">
import { defineElement } from '/runtime.js'

const events = { associated: 0, disabled: [], reset: 0 }
let internals

defineElement(${JSON.stringify(tag)}, {
  formAssociated: true,
  props: {
    value: { type: String, default: 'initial' },
  },
  form: {
    value: 'value',
    associated() { events.associated++ },
    disabled(value) { events.disabled.push(value) },
    reset() { events.reset++ },
  },
}, (_props, context) => {
  internals = context.internals
  return document.createElement('span')
})

window.runFormFixture = async () => {
  const form = document.createElement('form')
  const fieldset = document.createElement('fieldset')
  const element = document.createElement(${JSON.stringify(tag)})
  element.setAttribute('name', 'field')
  element.id = 'field'
  const label = document.createElement('label')
  label.htmlFor = 'field'
  label.textContent = 'Field'
  let labelClicks = 0
  element.addEventListener('click', () => labelClicks++)
  fieldset.append(label, element)
  form.append(fieldset)
  document.body.append(form)

  const frame = () =>
    new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )

  await frame()
  const initial = new FormData(form).get('field')

  element.value = 'next'
  await frame()
  const updated = new FormData(form).get('field')

  // A form-associated element is labelable: the label is reported through
  // ElementInternals and activating it clicks the element.
  const labelled =
    internals.labels.length === 1 && internals.labels[0] === label
  label.click()

  fieldset.disabled = true
  await frame()
  form.reset()
  await frame()

  return {
    initial,
    updated,
    associated: events.associated,
    disabled: events.disabled,
    reset: events.reset,
    labelled,
    labelClicks,
  }
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
        () => typeof window.runFormFixture === 'function',
      )
      const actual = await tab.evaluate(() => window.runFormFixture())
      assert.deepEqual(actual, {
        initial: 'initial',
        updated: 'next',
        associated: 1,
        disabled: [true],
        reset: 1,
        labelled: true,
        labelClicks: 1,
      })
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
      `${result.browser} form-associated browser check failed: ${result.error}`,
    )
  }
}

console.log(JSON.stringify(results, null, 2))
