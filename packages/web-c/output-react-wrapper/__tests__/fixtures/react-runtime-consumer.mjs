import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const [mode, reactPath, serverPath, clientPath] = process.argv.slice(2)
for (const name of ['HTMLElement', 'customElements', 'document']) {
  assert.equal(typeof globalThis[name], 'undefined')
}

const { createComponent } = await import(
  process.env.ZEUS_REACT_RUNTIME ?? '../../src/runtime/createComponent.ts'
)
const { default: React } = await import(pathToFileURL(reactPath))
const { renderToString } = await import(pathToFileURL(serverPath))

let registrations = 0
let ButtonElement
const Wrapper = createComponent({
  react: React,
  tagName: 'z-runtime-button',
  displayName: 'RuntimeButton',
  props: { value: false, formatter: false, label: 'heading', count: 'count', enabled: 'enabled', internal: false },
  events: { onValueChange: 'value-change' },
  slots: ['prefix'],
  defineCustomElement() {
    registrations += 1
    ButtonElement = class extends HTMLElement {
      get value() {
        return this._value
      }
      set value(value) {
        this._value = value
      }
      focus() {
        this.focused = true
      }
    }
    customElements.define('z-runtime-button', ButtonElement)
  },
})

assert.equal(
  registrations,
  0,
  'creating a wrapper must not register an element',
)
assert.equal(
  renderToString(
    React.createElement(Wrapper, {
      id: 'server',
      className: 'button',
      label: 'server',
      count: 0,
      enabled: true,
      internal: 'private',
      value: { items: ['server'] },
      formatter: value => value,
      prefix: 'Prefix',
      onValueChange() {},
      children: 'Content',
    }),
  ),
  '<z-runtime-button id="server" class="button" heading="server" count="0" enabled=""><span slot="prefix" style="display:contents">Prefix</span>Content</z-runtime-button>',
)
assert.equal(renderToString(React.createElement(Wrapper, { enabled: false })), '<z-runtime-button></z-runtime-button>')
assert.equal(registrations, 0, 'server rendering must not register an element')

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
  const { act } = React
  const root = createRoot(document.querySelector('main'))
  const ref = React.createRef()
  const value = { items: ['a'] }
  const formatter = item => item.toUpperCase()
  const events = []
  const firstHandler = event => events.push(['first', event.detail])
  const nextHandler = event => events.push(['next', event.detail])
  const render = handler =>
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(Wrapper, {
        ref,
        value,
        formatter,
        id: 'browser',
        onValueChange: handler,
        prefix: React.createElement('b', null, 'Prefix'),
        children: React.createElement('i', null, 'Content'),
      }),
    )

  await act(async () => root.render(render(firstHandler)))
  const element = document.querySelector('z-runtime-button')
  assert.ok(element instanceof ButtonElement)
  assert.equal(registrations, 1, 'StrictMode must register exactly once')
  assert.equal(ref.current, element)
  assert.equal(element.value, value)
  assert.equal(element.formatter, formatter)
  assert.equal(element.hasAttribute('value'), false)
  assert.equal(element.querySelector('[slot="prefix"]').textContent, 'Prefix')
  const child = element.querySelector('i')
  element.dispatchEvent(new CustomEvent('value-change', { detail: value }))
  assert.deepEqual(events, [['first', value]])
  ref.current.focus()
  assert.equal(element.focused, true)

  await act(async () => root.render(render(nextHandler)))
  assert.equal(element.querySelector('i'), child)
  element.dispatchEvent(new CustomEvent('value-change', { detail: value }))
  assert.deepEqual(events, [
    ['first', value],
    ['next', value],
  ])
  await act(async () =>
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Wrapper, { ref }),
      ),
    ),
  )
  assert.equal(element.value, undefined)
  assert.equal(element.id, '')
  element.dispatchEvent(new CustomEvent('value-change'))
  assert.equal(events.length, 2)
  await act(async () => root.unmount())
  assert.equal(ref.current, null)
  element.dispatchEvent(new CustomEvent('value-change'))
  assert.equal(events.length, 2, 'unmount must remove custom event listeners')
  dom.window.close()
}

console.log(`${mode}: ok (React ${React.version})`)
