import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bindText, render } from '../src'

describe('render', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders into container', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    render(el, container)

    expect(container.firstChild).toBe(el)
  })

  it('clears container on dispose', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    const dispose = render(el, container)

    expect(container.firstChild).toBe(el)

    dispose()

    expect(container.firstChild).toBe(null)
  })

  it('stops effects after dispose', async () => {
    const { state } = await import('@zeus-js/signal')
    const container = document.createElement('div')
    const count = state(0)

    const dispose = render(() => {
      const text = document.createTextNode('')
      bindText(text, () => String(count.value))
      return text
    }, container)

    expect(container.textContent).toBe('0')

    dispose()

    count.value++

    expect(container.textContent).toBe('')
  })

  it('allows dispose to be called twice', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    const dispose = render(el, container)

    dispose()
    dispose()

    expect(container.firstChild).toBe(null)
  })

  it('clears container on re-render', () => {
    const container = document.createElement('div')
    const child = document.createElement('p')
    child.textContent = 'old'
    container.appendChild(child)

    const dispose = render(() => {
      const span = document.createElement('span')
      span.textContent = 'new'
      return span
    }, container)

    expect(container.firstChild?.textContent).toBe('new')
    expect(container.querySelector('p')).toBe(null)

    dispose()
  })

  it('renders reactive text binding', async () => {
    const { state } = await import('@zeus-js/signal')
    const container = document.createElement('div')
    const count = state(0)

    const dispose = render(() => {
      const text = document.createTextNode('')
      bindText(text, () => String(count.value))
      return text
    }, container)

    expect(container.textContent).toBe('0')

    count.value = 1
    expect(container.textContent).toBe('1')

    count.value = 2
    expect(container.textContent).toBe('2')

    dispose()
  })

  it('does not update DOM after dispose even if state changes', async () => {
    const { state } = await import('@zeus-js/signal')
    const container = document.createElement('div')
    const count = state(0)

    const dispose = render(() => {
      const text = document.createTextNode('')
      bindText(text, () => String(count.value))
      return text
    }, container)

    expect(container.textContent).toBe('0')

    dispose()

    count.value = 42

    expect(container.textContent).toBe('')
  })
})
