import { state } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { jsx } from '../jsx-runtime.js'

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('@zeus-js/zeus/jsx-runtime entry', () => {
  let dom: JSDOM

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement)
    vi.stubGlobal('Node', dom.window.Node)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('binds function attributes instead of stringifying the function source', async () => {
    const disabled = state(false)
    const button = jsx('button', {
      disabled: () => disabled.value,
      'aria-disabled': () => (disabled.value ? 'true' : undefined),
      children: 'Save',
    }) as HTMLButtonElement

    await nextFrame()

    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.hasAttribute('aria-disabled')).toBe(false)

    disabled.value = true
    await nextFrame()

    expect(button.disabled).toBe(true)
    expect(button.getAttribute('disabled')).toBe('')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('disabled')).not.toContain('=>')
  })

  it('binds function property values through prop-prefixed attributes', async () => {
    const value = state('a')
    const input = jsx('input', {
      'prop:value': () => value.value,
    }) as HTMLInputElement

    await nextFrame()
    expect(input.value).toBe('a')

    value.value = 'b'
    await nextFrame()
    expect(input.value).toBe('b')
  })
})
