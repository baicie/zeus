// Records how Chromium, Firefox and WebKit expose Shadow DOM and Light DOM
// components to assistive technology, and that slotted content stays visible
// at device scale factors 1 and 2 and at 200% page zoom. Build first with
// `pnpm build`.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { chromium, firefox, webkit } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '../..')
const output = path.join(root, 'temp/a11y-browser')
const runtime = await fs.readFile(
  path.join(root, 'packages/core/runtime-dom/dist/runtime-dom.esm-browser.js'),
)

// Accessible names must survive shadow roots, default and named slots, and
// light DOM labels.
const expectedTree = `- main:
  - button "Save changes"
  - heading "Billing" [level=2]
  - text: Due on Friday Email
  - textbox "Email"`

const page = `<!doctype html>
<meta charset="utf-8">
<main id="app">
  <z-a11y-button>Save changes</z-a11y-button>
  <z-a11y-card><h2 slot="title">Billing</h2>Due on Friday</z-a11y-card>
  <z-a11y-field label="Email"></z-a11y-field>
</main>
<script type="module">
import { defineElement, Host, Slot } from '/runtime.js'

defineElement('z-a11y-button', { shadow: true }, () => {
  const button = document.createElement('button')
  button.setAttribute('part', 'control')
  button.append(Slot({}))
  return Host({ children: button })
})

defineElement('z-a11y-card', { shadow: true }, () => {
  const header = document.createElement('header')
  header.append(Slot({ name: 'title' }))
  const body = document.createElement('section')
  body.append(Slot({}))
  return Host({ children: [header, body] })
})

defineElement('z-a11y-field', { props: { label: String } }, props => {
  const label = document.createElement('label')
  label.textContent = props.label
  const input = document.createElement('input')
  input.id = 'a11y-email'
  label.htmlFor = input.id
  const fragment = document.createDocumentFragment()
  fragment.append(label, input)
  return fragment
})

window.a11yReady = true
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

interface Result {
  browser: string
  status: string
  tree?: string
  boxes?: Record<string, { width: number; height: number; clipped: boolean }>
  error?: string
}
const results: Result[] = []

try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    let browser
    try {
      browser = await engine.launch({ headless: true })
      const boxes: Result['boxes'] = {}
      let tree = ''
      for (const deviceScaleFactor of [1, 2]) {
        const context = await browser.newContext({ deviceScaleFactor })
        const tab = await context.newPage()
        const errors: string[] = []
        tab.on('pageerror', error => errors.push(error.message))
        await tab.goto(origin)
        await tab.waitForFunction(
          () => (window as unknown as { a11yReady?: boolean }).a11yReady,
        )

        tree = (await tab.locator('#app').ariaSnapshot()).trim()
        assert.equal(tree, expectedTree, `${name} accessibility tree`)

        // Slotted text must fit inside the shadow button at every scale.
        boxes[`scale-${deviceScaleFactor}`] = await tab
          .locator('z-a11y-button')
          .evaluate(host => {
            const button = host.shadowRoot!.querySelector('button')!
            const rect = button.getBoundingClientRect()
            return {
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              clipped: button.scrollWidth > button.clientWidth,
            }
          })
        assert.equal(boxes[`scale-${deviceScaleFactor}`].clipped, false)

        if (deviceScaleFactor === 1) {
          // 200% page zoom reflows layout, unlike a device scale factor.
          boxes['zoom-200'] = await tab
            .locator('z-a11y-button')
            .evaluate(host => {
              document.documentElement.style.zoom = '2'
              const button = host.shadowRoot!.querySelector('button')!
              const rect = button.getBoundingClientRect()
              return {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                clipped: button.scrollWidth > button.clientWidth,
              }
            })
          assert.equal(boxes['zoom-200'].clipped, false)
          assert.equal(
            (await tab.locator('#app').ariaSnapshot()).trim(),
            expectedTree,
            `${name} accessibility tree at 200% zoom`,
          )
        }
        assert.deepEqual(errors, [])
        await context.close()
      }
      assert.deepEqual(boxes['scale-1'].width, boxes['scale-2'].width)
      results.push({ browser: name, status: 'passed', tree, boxes })
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
    throw new Error(`${result.browser} a11y check failed: ${result.error}`)
  }
}

console.log(JSON.stringify(results, null, 2))
