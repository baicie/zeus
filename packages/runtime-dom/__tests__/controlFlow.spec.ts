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
    const clone = template('<div><!></div>')()
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
    const clone = template('<div><!></div>')()
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

  it('switches between children and fallback', () => {
    const visible = state(true)
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountShow(
      root,
      anchor,
      () => visible.value,
      () => {
        const span = document.createElement('span')
        span.textContent = 'visible'
        return span
      },
      () => {
        const span = document.createElement('span')
        span.textContent = 'hidden'
        return span
      },
    )

    expect(root.textContent).toBe('visible')

    visible.value = false
    expect(root.textContent).toBe('hidden')

    visible.value = true
    expect(root.textContent).toBe('visible')
  })

  it('does not keep stale nodes after many toggles', () => {
    const visible = state(true)
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountShow(
      root,
      anchor,
      () => visible.value,
      () => {
        const span = document.createElement('span')
        span.textContent = 'visible'
        return span
      },
      () => null,
    )

    for (let i = 0; i < 10; i++) {
      visible.value = !visible.value
    }

    const spans = root.querySelectorAll('span')

    expect(spans.length).toBe(1)
  })

  it('clears current nodes on scope stop', async () => {
    const { scope } = await import('@zeus-js/signal')
    const visible = state(true)
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    const s = scope()
    s.run(() => {
      mountShow(
        root,
        anchor,
        () => visible.value,
        () => {
          const span = document.createElement('span')
          span.textContent = 'visible'
          return span
        },
      )
    })

    expect(root.textContent).toBe('visible')

    s.stop()

    expect(root.textContent).toBe('')
    expect(root.childNodes).toHaveLength(1)
    expect(root.firstChild).toBe(anchor)
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
    const clone = template('<ul><!></ul>')()
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
    const clone = template('<ul><!></ul>')()
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
    const clone = template('<ul><!></ul>')()
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

  it('handles keyed list with initial items', () => {
    const items = state([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      () => items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    expect(root.textContent).toBe('ab')
  })

  it('moves keyed items instead of recreating them', () => {
    const items = state([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
      { id: 3, title: 'c' },
    ])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      () => items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        li.setAttribute('data-id', String(item.id))
        return li
      },
    )

    const firstNode = root.querySelector('[data-id="1"]')

    // Move: splice to [c, b, a] order
    const arr = items as unknown as Array<{ id: number; title: string }>
    const [a, b, c] = arr
    arr.splice(0, 3, c, b, a)

    expect(root.textContent).toBe('cba')
    expect(root.querySelector('[data-id="1"]')).toBe(firstNode)
  })

  it('removes disappeared keyed items', () => {
    const items = state([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      () => items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    items.splice(0, 1)

    expect(root.textContent).toBe('b')
  })

  it('cleans list nodes when scope stops', async () => {
    const { scope } = await import('@zeus-js/signal')
    const items = state([{ id: 1 }, { id: 2 }])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    const s = scope()
    s.run(() => {
      mountFor(
        root,
        anchor,
        () => items,
        item => item.id,
        item => {
          const li = document.createElement('li')
          li.textContent = String(item.id)
          return li
        },
      )
    })

    expect(root.querySelectorAll('li')).toHaveLength(2)

    s.stop()

    expect(root.querySelectorAll('li')).toHaveLength(0)
    expect(root.childNodes).toHaveLength(1)
    expect(root.firstChild).toBe(anchor)
  })
})
