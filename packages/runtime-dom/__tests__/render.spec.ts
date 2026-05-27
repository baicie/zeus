import { state } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bindText, bindTextContent, render } from '../src'

describe('render', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Element', dom.window.Element)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders node into container', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    render(el, container)

    expect(container.firstChild).toBe(el)
  })

  it('renders text into container', () => {
    const container = document.createElement('div')

    render('hello', container)

    expect(container.textContent).toBe('hello')
  })

  it('renders DocumentFragment', () => {
    const container = document.createElement('div')
    const fragment = document.createDocumentFragment()
    fragment.appendChild(document.createElement('span'))
    fragment.appendChild(document.createTextNode('text'))

    render(fragment, container)

    expect(container.firstChild).toBeInstanceOf(Element)
    expect(container.textContent).toBe('text')
  })

  it('renders reactive function', () => {
    const container = document.createElement('div')
    const count = state(0)
    const text = document.createTextNode('')

    render(() => {
      bindText(text, () => count.value)
      return text
    }, container)

    expect(text.data).toBe('0')
    expect(container.firstChild).toBe(text)
  })

  it('binds raw text element content reactively', () => {
    const color = state('red')
    const style = document.createElement('style')

    bindTextContent(style, () => [`.count { color: `, color.value, `; }`])

    expect(style.textContent).toBe('.count { color: red; }')
    color.value = 'blue'
    expect(style.textContent).toBe('.count { color: blue; }')
  })

  it('disposes rendered content', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    const dispose = render(el, container)

    expect(container.firstChild).toBe(el)

    dispose()

    expect(container.firstChild).toBeNull()
  })

  it('clears container before rendering', () => {
    const container = document.createElement('div')
    container.appendChild(document.createTextNode('old'))

    render('new', container)

    expect(container.textContent).toBe('new')
  })

  it('stops effects after dispose', () => {
    const container = document.createElement('div')
    const count = state(0)
    const text = document.createTextNode('')

    const dispose = render(() => {
      bindText(text, () => count.value)
      return text
    }, container)

    expect(text.data).toBe('0')

    dispose()

    count.value++

    expect(text.data).toBe('0')
  })

  it('returns a dispose function that can be called multiple times', () => {
    const container = document.createElement('div')

    const dispose = render('hello', container)
    dispose()
    dispose()

    expect(container.textContent).toBe('')
  })
})
