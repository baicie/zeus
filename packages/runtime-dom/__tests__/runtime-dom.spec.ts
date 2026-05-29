import { state } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  child,
  defineElement,
  insert,
  marker,
  mountFor,
  mountShow,
  render,
  template,
} from '../src'

describe('runtime-dom integration', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('customElements', dom.window.customElements)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('finds marker and child nodes in compiled templates', () => {
    const clone = template<DocumentFragment>(
      '<div><span></span><!><b></b></div>',
    )()
    const root = clone.firstChild as Element

    expect((child(root, 2) as Element).tagName).toBe('B')
    expect(marker(root, 0).nodeType).toBe(Node.COMMENT_NODE)
  })

  it('resolves markers only among direct children', () => {
    const clone = template<DocumentFragment>('<div><!><!></div>')()
    const root = clone.firstChild as Element
    const first = marker(root, 0)
    const nested = template<DocumentFragment>(
      '<section><span><!></span></section>',
    )().firstChild as Element

    insert(root, nested, first)

    expect(marker(root, 1).parentNode).toBe(root)
  })

  it('updates Show regions reactively', () => {
    const visible = state(false)
    const clone = template<DocumentFragment>('<div><!></div>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountShow(
      root,
      anchor,
      () => visible.value,
      () => 'yes',
      () => 'no',
    )

    expect(root.textContent).toBe('no')
    visible.value = true
    expect(root.textContent).toBe('yes')
  })

  it('updates For regions reactively', () => {
    const items = state(['a'])
    const clone = template<DocumentFragment>('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      () => items,
      undefined,
      item => {
        const li = document.createElement('li')
        li.textContent = item
        return li
      },
    )

    expect(root.textContent).toBe('a')
    items.splice(0, items.length, 'b', 'c')
    expect(root.textContent).toBe('bc')
  })

  it('renders and disposes content', () => {
    const root = document.createElement('div')
    const dispose = render(() => 'hello', root)

    expect(root.textContent).toBe('hello')
    dispose()
    expect(root.textContent).toBe('')
  })

  it('defines custom elements with attribute casting', () => {
    defineElement(
      'z-runtime-test',
      {
        shadow: false,
        props: {
          count: Number,
          open: Boolean,
        },
      },
      props => {
        const span = document.createElement('span')
        span.textContent = `${props.count}:${props.open}`
        return span
      },
    )

    const el = document.createElement('z-runtime-test')
    el.setAttribute('count', '3')
    el.setAttribute('open', '')
    document.body.appendChild(el)

    expect(el.textContent).toBe('3:true')
  })
})
