import { state } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { For, Show, mountFor, mountShow, resolveValue } from '../src'
import { marker } from '../src/dom'
import { template } from '../src/template'

describe('Show', () => {
  it('renders children when when is truthy', () => {
    const result = Show({ when: true, children: 'hello' })
    expect(result).toBe('hello')
  })

  it('renders fallback when when is falsy', () => {
    const result = Show({ when: false, children: 'a', fallback: 'b' })
    expect(result).toBe('b')
  })

  it('renders null when no fallback and when is falsy', () => {
    const result = Show({ when: false, children: 'a' })
    expect(result).toBeNull()
  })

  it('calls children function', () => {
    const result = Show({ when: true, children: () => 'computed' })
    expect(result).toBe('computed')
  })

  it('calls fallback function', () => {
    const result = Show({ when: false, fallback: () => 'fallback' })
    expect(result).toBe('fallback')
  })
})

describe('resolveValue', () => {
  it('returns value as-is if not a function', () => {
    expect(resolveValue('hello')).toBe('hello')
    expect(resolveValue(null)).toBeNull()
  })

  it('calls function if value is a function', () => {
    expect(resolveValue(() => 'computed')).toBe('computed')
  })

  it('returns null for undefined', () => {
    expect(resolveValue(undefined)).toBeNull()
  })
})

describe('For', () => {
  it('maps items with children function', () => {
    const items = [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]

    const result = For({
      each: items,
      children: (item, index) => `${item.name}:${index}`,
    })

    expect(result).toEqual(['a:0', 'b:1'])
  })

  it('returns null for null each', () => {
    const result = For<string>({ each: null, children: item => item })
    expect(result).toBeNull()
  })

  it('returns null for undefined each', () => {
    const result = For<string>({ each: undefined, children: item => item })
    expect(result).toBeNull()
  })

  it('returns empty array for empty each', () => {
    const result = For({ each: [], children: item => item })
    expect(result).toEqual([])
  })
})

describe('mountShow', () => {
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

  it('updates Show without fallback', () => {
    const visible = state(false)
    const clone = template<DocumentFragment>('<div><!></div>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountShow(
      root,
      anchor,
      () => visible.value,
      () => 'yes',
    )

    expect(root.textContent).toBe('')
    visible.value = true
    expect(root.textContent).toBe('yes')
    visible.value = false
    expect(root.textContent).toBe('')
  })
})

describe('mountFor', () => {
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

  it('updates For regions reactively', () => {
    const items = state(['a']) as unknown as string[]
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

  it('handles empty array', () => {
    const items = state(['a', 'b']) as unknown as string[]
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

    expect(root.textContent).toBe('ab')
    items.length = 0
    expect(root.textContent).toBe('')
  })

  it('handles null each', () => {
    const items = state(['a']) as unknown as string[] | null
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
    if (items !== null) {
      items.splice(
        0,
        items.length,
        ...([] as string[]),
        null as unknown as string,
      )
    }
    expect(root.textContent).toBe('')
  })
})
