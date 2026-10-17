import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { insert, mountDynamic } from '../src'
import { DynamicRange } from '../src/range'

describe('insert', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('inserts a Node before marker', () => {
    const parent = document.createElement('div')
    const child = document.createElement('span')
    const marker_ = document.createComment('')

    parent.appendChild(marker_)

    insert(parent, child, marker_)

    expect(child.parentNode).toBe(parent)
    expect(parent.firstChild).toBe(child)
    expect(parent.lastChild).toBe(marker_)
  })

  it('inserts a Text node', () => {
    const parent = document.createElement('div')

    insert(parent, 'hello', null)

    expect(parent.firstChild).toBeInstanceOf(dom.window.Text)
    expect(parent.textContent).toBe('hello')
  })

  it('inserts an array of nodes', () => {
    const parent = document.createElement('div')
    const children = [
      document.createElement('span'),
      document.createTextNode('text'),
      document.createElement('b'),
    ]

    insert(parent, children, null)

    expect(parent.childNodes.length).toBe(3)
    expect(parent.textContent).toBe('text')
  })

  it('ignores null/false/true', () => {
    const parent = document.createElement('div')

    insert(parent, null, null)
    insert(parent, false, null)
    insert(parent, true, null)

    expect(parent.childNodes.length).toBe(0)
  })

  it('creates Text node for non-string primitives', () => {
    const parent = document.createElement('div')

    insert(parent, 42, null)
    insert(parent, 0, null)
    insert(parent, '', null)

    expect(parent.childNodes.length).toBe(3)
    expect(parent.textContent).toBe('420')
  })

  it('rejects function values instead of stringifying function source', () => {
    const parent = document.createElement('div')
    const callback = () => 'value'

    expect(() => insert(parent, callback as never, null)).toThrow(
      'JSX children cannot contain functions',
    )
    expect(parent.childNodes).toHaveLength(0)
  })

  it('rejects Promise, Symbol, and object values instead of stringifying them', () => {
    const parent = document.createElement('div')
    const rejected = Promise.reject(new Error('later'))

    expect(() => insert(parent, rejected as never, null)).toThrow(
      'JSX children cannot contain Promises',
    )
    expect(() => insert(parent, Symbol('value') as never, null)).toThrow(
      'JSX children cannot contain Symbols',
    )
    expect(() => insert(parent, { value: 1 } as never, null)).toThrow(
      'JSX children must be primitives',
    )
    expect(parent.childNodes).toHaveLength(0)
  })

  it('validates a dynamic tree before replacing the current nodes', () => {
    const parent = document.createElement('div')
    const marker = document.createComment('marker')
    parent.append(marker)
    const range = new DynamicRange(parent, marker)

    range.replace('stable')
    expect(parent.textContent).toBe('stable')

    expect(() =>
      range.replace(['next', Promise.resolve('later')] as never),
    ).toThrow('JSX children cannot contain Promises')
    expect(parent.textContent).toBe('stable')
  })
})

describe('mountDynamic', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('mounts and updates dynamic content', () => {
    const parent = document.createElement('div')
    const anchor = document.createComment('')
    parent.appendChild(anchor)

    const count = { value: 0 }

    mountDynamic(parent, anchor, () => {
      const span = document.createElement('span')
      span.textContent = String(++count.value)
      return span
    })

    expect(parent.textContent).toBe('1')

    vi.unstubAllGlobals()
    dom.window.close()
  })
})
