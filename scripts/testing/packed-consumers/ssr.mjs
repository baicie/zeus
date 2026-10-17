import assert from 'node:assert/strict'

assert.equal(typeof HTMLElement, 'undefined')
assert.equal(typeof customElements, 'undefined')
assert.equal(typeof document, 'undefined')
const { ZPackedButton } = await import('@zeus-test/components/react')
const { ZPackedButton: VueButton } = await import('@zeus-test/components/vue')
const { defineCustomElement } = await import('@zeus-test/components/button')
defineCustomElement()
const React = await import('react')
const { renderToString } = await import('react-dom/server')
const html = renderToString(
  React.createElement(ZPackedButton, { label: 'server' }, 'slot'),
)
assert.match(html, /<z-packed-button/)
assert.match(html, /slot/)
const { createSSRApp, h } = await import('vue')
const { renderToString: renderVue } = await import('vue/server-renderer')
assert.match(
  await renderVue(
    createSSRApp({
      render: () => h(VueButton, { label: 'server' }, () => 'slot'),
    }),
  ),
  /<z-packed-button/,
)
assert.equal(typeof HTMLElement, 'undefined')
console.log('Packed React/Vue imports and SSR are DOM-free')
