import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const [
  mode,
  wrapperMode,
  wrapperPath,
  registrationPath,
  reactPath,
  serverPath,
  clientPath,
] = process.argv.slice(2)
for (const name of ['HTMLElement', 'customElements', 'document']) {
  assert.equal(typeof globalThis[name], 'undefined')
}
const { default: React } = await import(pathToFileURL(reactPath))
const { renderToString } = await import(pathToFileURL(serverPath))
const { ZButton } = await import(pathToFileURL(wrapperPath))
const { getRegistrations } = await import(pathToFileURL(registrationPath))
assert.equal(getRegistrations(), 0)
assert.match(
  renderToString(
    React.createElement(ZButton, { id: 'ssr', children: 'Content' }),
  ),
  /Content/,
)
assert.equal(getRegistrations(), 0, 'SSR must not register any custom element')
const html = renderToString(
  React.createElement(ZButton, {
    labelText: 'server',
    open: true,
    internal: 'private',
    value: {},
    formatter: () => 'secret',
  }),
)
assert.match(html, /heading="server"/)
assert.match(html, /open=""/)
assert.doesNotMatch(html, /(?:labeltext|internal|value|formatter)=/i)
assert.doesNotMatch(
  renderToString(React.createElement(ZButton, { open: false })),
  /open=/,
)

if (mode === 'browser') {
  const require = createRequire(import.meta.url)
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM(
    '<!doctype html><html><body><main></main></body></html>',
    {
      url: 'https://zeus.test/',
    },
  )
  for (const name of [
    'window',
    'document',
    'HTMLElement',
    'customElements',
    'Event',
    'CustomEvent',
  ]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: dom.window[name],
    })
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const { createRoot } = await import(pathToFileURL(clientPath))
  const root = createRoot(document.querySelector('main'))
  const ref = React.createRef()
  const value = { items: ['a'] }
  const events = []
  const props = {
    ref,
    value,
    onValueChange: event => events.push(event),
    prefix: React.createElement('b', null, 'Prefix'),
    children: React.createElement('i', null, 'Content'),
  }
  await React.act(async () =>
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(ZButton, props),
      ),
    ),
  )
  const element = document.querySelector('z-generated-button')
  assert.equal(customElements.get('z-unrelated-grid'), undefined)
  assert.equal(getRegistrations(), 1)
  assert.equal(ref.current, element)
  assert.equal(element.value, value)
  assert.equal(element.hasAttribute('value'), false)
  assert.equal(element.querySelector('[slot="prefix"]').textContent, 'Prefix')
  const child = element.querySelector('i')
  const nextValue = { items: ['b'] }
  await React.act(async () =>
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(ZButton, {
          ...props,
          value: nextValue,
          prefix: React.createElement('em', null, 'Next prefix'),
          children: React.createElement('i', null, 'Next content'),
        }),
      ),
    ),
  )
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(element.value, nextValue)
  const nextSlot = element.querySelector('[slot="prefix"]')
  assert.equal(nextSlot.textContent, 'Next prefix')
  if (wrapperMode === 'runtime') {
    assert.equal(nextSlot.tagName, 'SPAN')
    assert.equal(nextSlot.querySelector('em').textContent, 'Next prefix')
  } else {
    assert.equal(nextSlot.tagName, 'EM')
  }
  assert.equal(element.querySelector('i').textContent, 'Next content')
  assert.equal(element.querySelector('i'), child)
  assert.equal(element.hasAttribute('value'), false)
  const valueChangeEvent = new CustomEvent('value-change', {
    detail: value,
    bubbles: true,
    composed: true,
  })
  element.dispatchEvent(valueChangeEvent)
  assert.deepEqual(events, [valueChangeEvent])
  assert.equal(events[0].detail, value)
  await React.act(async () => root.unmount())
  assert.equal(ref.current, null)
  if (wrapperMode !== 'minimal') {
    element.dispatchEvent(new CustomEvent('value-change'))
    assert.equal(events.length, 1)
  }
  dom.window.close()
}

console.log(`${mode}: ${wrapperMode} ok (React ${React.version})`)
