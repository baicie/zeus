import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Host } from '../src'
import { render } from '../src'

describe('Host', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders children as transparent wrapper', () => {
    const container = document.createElement('div')

    render(() => {
      const span = document.createElement('span')
      span.textContent = 'host child'
      return Host({ children: span })
    }, container)

    expect(container.innerHTML).toContain('<span>host child</span>')
  })

  it('renders static text children', () => {
    const container = document.createElement('div')

    render(() => Host({ children: 'plain text' }), container)

    expect(container.textContent).toBe('plain text')
  })

  it('renders array of elements', () => {
    const container = document.createElement('div')

    render(() => {
      const items = [
        (() => {
          const el = document.createElement('li')
          el.textContent = 'item 1'
          return el
        })(),
        (() => {
          const el = document.createElement('li')
          el.textContent = 'item 2'
          return el
        })(),
      ]
      return Host({ children: items })
    }, container)

    expect(container.querySelectorAll('li').length).toBe(2)
    expect(container.textContent).toBe('item 1item 2')
  })

  it('renders null children', () => {
    const container = document.createElement('div')

    render(() => Host({ children: null }), container)

    expect(container.textContent).toBe('')
  })

  it('renders function children', () => {
    const container = document.createElement('div')

    render(() => {
      return Host({
        children: () => {
          const el = document.createElement('span')
          el.textContent = 'lazy child'
          return el
        },
      })
    }, container)

    expect(container.textContent).toBe('lazy child')
  })

  it('renders nested structure', () => {
    const container = document.createElement('div')

    render(() => {
      const header = document.createElement('h1')
      header.textContent = 'Title'
      const body = document.createElement('p')
      body.textContent = 'Paragraph'
      const frag = document.createDocumentFragment()
      frag.appendChild(header)
      frag.appendChild(body)
      return Host({ children: frag })
    }, container)

    expect(container.querySelector('h1')!.textContent).toBe('Title')
    expect(container.querySelector('p')!.textContent).toBe('Paragraph')
  })

  it('Host is transparent and passes through DOM nodes', () => {
    const container = document.createElement('div')

    render(() => {
      const outer = document.createElement('div')
      outer.className = 'outer'
      const inner = document.createElement('span')
      inner.textContent = 'inner'
      outer.appendChild(inner)
      return Host({ children: outer })
    }, container)

    expect(container.querySelector('div.outer')).toBeTruthy()
    expect(container.querySelector('div.outer span')!.textContent).toBe('inner')
  })
})
