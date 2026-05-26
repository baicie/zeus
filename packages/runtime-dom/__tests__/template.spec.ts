import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { template } from '../src'

describe('template', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('creates a template from html string', () => {
    const clone = template('<div><span>hello</span></div>')()

    expect(clone.firstChild).not.toBeNull()
    expect((clone.firstChild as Element).tagName).toBe('DIV')
    expect(((clone.firstChild as Element).firstChild as Element).tagName).toBe(
      'SPAN',
    )
  })

  it('returns a fresh clone each time', () => {
    const factory = template('<div></div>')

    const clone1 = factory()
    const clone2 = factory()

    expect(clone1).not.toBe(clone2)
    expect(clone1.firstChild).not.toBe(clone2.firstChild)
  })

  it('handles nested structures', () => {
    const clone = template('<ul><li>1</li><li>2</li></ul>')()
    const ul = clone.firstChild as Element

    expect(ul.tagName).toBe('UL')
    expect(ul.children.length).toBe(2)
    expect(ul.children[0].textContent).toBe('1')
    expect(ul.children[1].textContent).toBe('2')
  })

  it('creates comment markers', () => {
    const clone = template('<div><!><span></span></div>')()
    const div = clone.firstChild as Element

    expect(div.childNodes[0].nodeType).toBe(Node.COMMENT_NODE)
    expect(div.childNodes[1].nodeType).toBe(Node.ELEMENT_NODE)
  })

  it('returns DocumentFragment as default type', () => {
    const clone = template('<div></div>')()

    expect(clone.nodeType).toBe(Node.DOCUMENT_FRAGMENT_NODE)
  })

  it('accepts isImportNode/svg/mathml params without breaking', () => {
    const clone = template('<svg><rect /></svg>', false, true, false)()
    expect((clone.firstChild as Element).tagName.toLowerCase()).toBe('svg')
  })
})
