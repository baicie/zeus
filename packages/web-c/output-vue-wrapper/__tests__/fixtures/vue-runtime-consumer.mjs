import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const mode = process.argv[2]
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
const { h, createApp, createSSRApp, nextTick } = await import('vue')
const { renderToString } = await import('vue/server-renderer')
const { defineContainer } = await import(
  process.env.ZEUS_VUE_RUNTIME ?? '../../src/runtime/index.ts'
)
let registrations = 0
const Wrapper = defineContainer({
  tagName: 'z-vue-input',
  props: ['value', 'config', 'formatter'],
  events: ['value-change'],
  slots: ['prefix'],
  model: { prop: 'value', event: 'value-change' },
  defineCustomElement() {
    registrations += 1
    customElements.define(
      'z-vue-input',
      class extends HTMLElement {
        get value() {
          return this._value
        }
        set value(value) {
          this._value = value
        }
        get config() {
          return this._config
        }
        set config(value) {
          this._config = value
        }
        get formatter() {
          return this._formatter
        }
        set formatter(value) {
          this._formatter = value
        }
      },
    )
  },
})
assert.equal(registrations, 0, 'wrapper creation must not register')
if (mode === 'server') {
  const html = await renderToString(
    createSSRApp({ render: () => h(Wrapper, null, () => 'Content') }),
  )
  assert.match(html, /<z-vue-input/)
  assert.match(html, /Content/)
  assert.equal(registrations, 0)
} else {
  const config = { items: ['a'] }
  const formatter = item => item.toUpperCase()
  const events = []
  const updates = []
  const app = createApp({
    render: () =>
      h(
        Wrapper,
        {
          value: 'initial',
          config,
          formatter,
          onValueChange: event => events.push(event.detail),
          'onUpdate:value': value => updates.push(value),
        },
        {
          default: () => h('i', null, 'Content'),
          prefix: () => h('b', null, 'Prefix'),
        },
      ),
  })
  app.mount(document.querySelector('main'))
  await nextTick()
  const element = document.querySelector('z-vue-input')
  assert.equal(registrations, 1)
  assert.equal(element.config, config)
  assert.equal(element.formatter, formatter)
  assert.equal(element.hasAttribute('config'), false)
  assert.equal(element.querySelector('[slot="prefix"]').textContent, 'Prefix')
  element.dispatchEvent(new CustomEvent('value-change', { detail: 'next' }))
  await nextTick()
  assert.deepEqual(events, ['next'])
  assert.deepEqual(updates, ['next'])
  app.unmount()
  element.dispatchEvent(new CustomEvent('value-change', { detail: 'after' }))
  assert.deepEqual(events, ['next'])
  assert.deepEqual(updates, ['next'])
  dom.window.close()
}
console.log(`${mode}: ok`)
