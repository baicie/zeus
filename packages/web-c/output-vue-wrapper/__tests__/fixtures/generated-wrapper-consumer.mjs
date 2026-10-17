import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const [
  mode,
  wrapperMode,
  wrapperPath,
  registrationPath,
  vuePath,
  rendererPath,
] = process.argv.slice(2)
const require = createRequire(import.meta.url)
for (const name of ['HTMLElement', 'customElements', 'document']) {
  assert.equal(typeof globalThis[name], 'undefined')
}
let dom
if (mode === 'browser') {
  const { JSDOM } = require('jsdom')
  dom = new JSDOM('<!doctype html><html><body><main></main></body></html>')
  for (const name of [
    'window',
    'document',
    'HTMLElement',
    'customElements',
    'SVGElement',
    'Element',
    'Node',
    'CustomEvent',
  ]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: dom.window[name],
    })
  }
}
const { h, createApp, createSSRApp, nextTick } = await import(
  pathToFileURL(vuePath)
)
const { renderToString } = await import(pathToFileURL(rendererPath))
const { ZInput } = await import(pathToFileURL(wrapperPath))
const { getRegistrations } = await import(pathToFileURL(registrationPath))
assert.equal(getRegistrations(), 0)
if (mode === 'server') {
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(
          ZInput,
          {
            value: 'server',
            labelText: 'heading',
            count: 3,
            open: true,
            expanded: false,
            config: { items: ['server'] },
            formatter: () => 'secret',
            unknownValue: 'unknown',
            internal: 'private',
          },
          () => 'Content',
        ),
    }),
  )
  assert.match(html, /<z-generated-input/)
  assert.match(html, /value="server"/)
  assert.match(html, /heading="heading"/)
  assert.match(html, /count="3"/)
  assert.match(html, /open(?:="")?(?:\s|>)/)
  assert.doesNotMatch(
    html,
    /(?:config|formatter|unknown-value|internal|expanded)=/i,
  )
  assert.doesNotMatch(html, /\[object Object\]|secret/)
  assert.match(html, /Content/)
  assert.equal(getRegistrations(), 0)
} else {
  const config = { items: ['a'] }
  const formatter = item => item.toUpperCase()
  const events = []
  const updates = []
  const app = createApp({
    render: () =>
      h(
        ZInput,
        {
          value: 'initial',
          labelText: 'heading',
          count: 3,
          open: true,
          expanded: false,
          config,
          formatter,
          unknownValue: 'unknown',
          internal: 'private',
          onValueChange: event => events.push(event),
          ...(wrapperMode !== 'minimal'
            ? { 'onUpdate:value': value => updates.push(value) }
            : {}),
        },
        {
          default: () => h('i', null, 'Content'),
          prefix: () => h('b', null, 'Prefix'),
        },
      ),
  })
  app.mount(document.querySelector('main'))
  await nextTick()
  const element = document.querySelector('z-generated-input')
  assert.equal(getRegistrations(), 1)
  assert.equal(customElements.get('z-unrelated-grid'), undefined)
  assert.equal(element.config, config)
  assert.equal(element.formatter, formatter)
  assert.equal(element.hasAttribute('config'), false)
  assert.equal(element.querySelector('[slot="prefix"]').textContent, 'Prefix')
  const detail = { value: 'next' }
  const valueChangeEvent = new CustomEvent('value-change', {
    detail,
    bubbles: true,
    composed: true,
  })
  element.dispatchEvent(valueChangeEvent)
  await nextTick()
  assert.deepEqual(events, [valueChangeEvent])
  assert.equal(events[0].detail, detail)
  if (wrapperMode !== 'minimal') assert.deepEqual(updates, ['next'])
  app.unmount()
  if (wrapperMode !== 'minimal') {
    element.dispatchEvent(new CustomEvent('value-change', { detail: 'after' }))
    assert.deepEqual(events, [valueChangeEvent])
    assert.deepEqual(updates, ['next'])
  }
  dom.window.close()
}
console.log(`${mode}: ${wrapperMode} ok`)
