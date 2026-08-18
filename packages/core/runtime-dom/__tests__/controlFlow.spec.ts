import {
  createRoot,
  createSignal,
  effect,
  onScopeDispose,
  state,
} from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { For, Show, mountFor, mountShow, resolveValue } from '../src'
import { createComponent, createContext, useContext } from '../src'
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

  it('continues switching branches after its fragment is inserted', () => {
    const [visible, setVisible] = createSignal(true)
    const fragment = document.createDocumentFragment()
    const anchor = document.createComment('')
    fragment.append(anchor)

    mountShow(
      fragment,
      anchor,
      visible,
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

    const container = document.createElement('div')
    container.append(fragment)

    expect(container.textContent).toBe('visible')

    setVisible(false)
    expect(container.textContent).toBe('hidden')

    setVisible(true)
    expect(container.textContent).toBe('visible')
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
    const { scope } = await import('@zeus-js/signal/internal')
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

  it('preserves context owner while rendering reactive branches', () => {
    const Context = createContext<string>()
    const visible = state(false)
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    function Child() {
      const value = useContext(Context)
      const span = document.createElement('span')
      span.textContent = value
      return span
    }

    function App() {
      return Context.Provider({
        value: 'provided',
        get children() {
          mountShow(
            root,
            anchor,
            () => visible.value,
            () => createComponent(Child, {}),
          )

          return root
        },
      })
    }

    createComponent(App, {})
    expect(root.textContent).toBe('')

    visible.value = true

    expect(root.textContent).toBe('provided')
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
        li.textContent = item()
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
        li.textContent = item()
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
        li.textContent = item()
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
        li.textContent = item().title
        return li
      },
    )

    expect(root.textContent).toBe('ab')
  })

  it('keeps non-empty keyed records ordered across an empty record', () => {
    const [items, setItems] = createSignal([
      { id: 1, value: 'a' },
      { id: 2, value: null },
      { id: 3, value: 'c' },
    ])
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => item().value,
    )

    expect(root.textContent).toBe('ac')

    setItems([items()[2], items()[1], items()[0]])

    expect(root.textContent).toBe('ca')
  })

  it('keeps non-empty keyed records ordered across consecutive empty records', () => {
    const [items, setItems] = createSignal([
      { id: 1, value: 'a' },
      { id: 2, value: null },
      { id: 3, value: null },
      { id: 4, value: 'd' },
    ])
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => item().value,
    )

    expect(root.textContent).toBe('ad')

    const [first, second, third, fourth] = items()
    setItems([fourth, third, second, first])

    expect(root.textContent).toBe('da')
  })

  it('continues updating a keyed list after its fragment is inserted', () => {
    const [items, setItems] = createSignal([
      { id: 1, value: 'a' },
      { id: 2, value: 'b' },
    ])
    const fragment = document.createDocumentFragment()
    const anchor = document.createComment('')
    fragment.append(anchor)

    mountFor(
      fragment,
      anchor,
      items,
      item => item.id,
      item => {
        const span = document.createElement('span')
        effect(() => {
          span.dataset.id = String(item().id)
          span.textContent = item().value
        })
        return span
      },
    )

    const container = document.createElement('div')
    container.append(fragment)
    const [first, second] = Array.from(container.querySelectorAll('span'))

    setItems([
      { id: 2, value: 'b next' },
      { id: 1, value: 'a next' },
    ])

    expect(container.textContent).toBe('b nexta next')
    expect(container.querySelectorAll('span')[0]).toBe(second)
    expect(container.querySelectorAll('span')[1]).toBe(first)

    setItems([
      { id: 2, value: 'b latest' },
      { id: 3, value: 'c' },
      { id: 1, value: 'a latest' },
    ])

    expect(container.textContent).toBe('b latestca latest')
    expect(container.querySelector('[data-id="2"]')).toBe(second)
    expect(container.querySelector('[data-id="1"]')).toBe(first)
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
        li.textContent = item().title
        li.setAttribute('data-id', String(item().id))
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

  it('updates same-key item and index accessors without replacing DOM', () => {
    const [items, setItems] = createSignal([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      (item, index) => {
        const li = document.createElement('li')

        effect(() => {
          li.textContent = `${item().title}:${index()}`
        })

        return li
      },
    )

    const [first, second] = Array.from(root.querySelectorAll('li'))

    setItems([
      { id: 2, title: 'b next' },
      { id: 1, title: 'a next' },
    ])

    expect(root.textContent).toBe('b next:0a next:1')
    expect(root.querySelectorAll('li')[0]).toBe(second)
    expect(root.querySelectorAll('li')[1]).toBe(first)
  })

  it('updates function-valued items without invoking them as signal updaters', () => {
    type Item = (() => string) & { id: number }
    const createItem = (id: number, value: string): Item =>
      Object.assign(() => value, { id })
    const [items, setItems] = createSignal<Item[]>([createItem(1, 'initial')])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        effect(() => {
          li.textContent = item()()
        })
        return li
      },
    )

    const node = root.querySelector('li')
    setItems([createItem(1, 'replacement')])

    expect(root.textContent).toBe('replacement')
    expect(root.querySelector('li')).toBe(node)
  })

  it('skips DOM moves when keyed ranges are already adjacent', () => {
    const [items, setItems] = createSignal([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        effect(() => {
          li.textContent = item().title
        })
        return li
      },
    )

    const insertBefore = vi.spyOn(root, 'insertBefore')

    setItems([
      { id: 1, title: 'a next' },
      { id: 2, title: 'b next' },
    ])

    expect(root.textContent).toBe('a nextb next')
    expect(insertBefore).not.toHaveBeenCalled()
  })

  it('rejects duplicate keys before mutating rendered records', () => {
    const [items, setItems] = createSignal([{ id: 1, title: 'a' }])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        effect(() => {
          li.textContent = item().title
        })
        return li
      },
    )

    const first = root.querySelector('li')

    expect(() =>
      setItems([
        { id: 1, title: 'first duplicate' },
        { id: 1, title: 'second duplicate' },
      ]),
    ).toThrow(/duplicate key 1 at index 1/)
    expect(root.textContent).toBe('a')
    expect(root.querySelector('li')).toBe(first)

    setItems([
      { id: 1, title: 'recovered' },
      { id: 2, title: 'b' },
    ])

    expect(root.textContent).toBe('recoveredb')
    expect(root.querySelectorAll('li')[0]).toBe(first)
  })

  it('rolls back newly mounted records when a later render throws', () => {
    const [items, setItems] = createSignal([{ id: 1, title: 'a' }])
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const value = item()
        if (value.id === 3) throw new Error('render failed')

        onScopeDispose(() => disposedItems.push(value.id))
        const li = document.createElement('li')
        effect(() => {
          li.textContent = item().title
        })
        return li
      },
    )

    expect(() =>
      setItems([
        { id: 1, title: 'a' },
        { id: 2, title: 'b' },
        { id: 3, title: 'c' },
      ]),
    ).toThrow('render failed')

    expect(root.textContent).toBe('a')
    expect(disposedItems).toEqual([2])

    setItems([{ id: 1, title: 'recovered' }])
    expect(root.textContent).toBe('recovered')
  })

  it('reconciles a source update triggered by a same-key item effect', () => {
    const [items, setItems] = createSignal([{ id: 1, title: 'initial' }])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)
    let redirected = false

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        effect(() => {
          const title = item().title
          li.textContent = title

          if (title === 'trigger' && !redirected) {
            redirected = true
            setItems([{ id: 1, title: 'final' }])
          }
        })
        return li
      },
    )

    setItems([{ id: 1, title: 'trigger' }])

    expect(items()[0].title).toBe('final')
    expect(root.textContent).toBe('final')
  })

  it('reconciles an unkeyed source update triggered while mounting a row', () => {
    const [items, setItems] = createSignal(['trigger'])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    mountFor(root, anchor, items, undefined, item => {
      const li = document.createElement('li')
      effect(() => {
        const value = item()
        li.textContent = value
        if (value === 'trigger') setItems(['final'])
      })
      return li
    })

    expect(items()).toEqual(['final'])
    expect(root.textContent).toBe('final')
  })

  it('cleans a keyed record when its owner disposes during initial mount', () => {
    const [items] = createSignal([{ id: 1 }])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)
    let cleanupCount = 0

    createRoot(dispose => {
      mountFor(
        root,
        anchor,
        items,
        item => item.id,
        () => {
          const li = document.createElement('li')
          onScopeDispose(() => cleanupCount++)
          dispose()
          return li
        },
      )
    })

    expect(root.childNodes).toHaveLength(1)
    expect(root.firstChild).toBe(anchor)
    expect(root.querySelectorAll('li')).toHaveLength(0)
    expect(cleanupCount).toBe(1)
  })

  it('cleans keyed records when their owner disposes during an update', () => {
    const [items, setItems] = createSignal([{ id: 1 }])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)
    const disposedItems: number[] = []
    let disposeRoot: (() => void) | undefined

    createRoot(dispose => {
      disposeRoot = dispose
      mountFor(
        root,
        anchor,
        items,
        item => item.id,
        item => {
          const value = item()
          const li = document.createElement('li')
          li.textContent = String(value.id)
          onScopeDispose(() => disposedItems.push(value.id))
          if (value.id === 2) dispose()
          return li
        },
      )
    })

    setItems([{ id: 1 }, { id: 2 }])

    expect(disposeRoot).toBeTypeOf('function')
    expect(root.querySelectorAll('li')).toHaveLength(0)
    expect(root.childNodes).toHaveLength(1)
    expect(root.firstChild).toBe(anchor)
    expect(disposedItems.sort()).toEqual([1, 2])
  })

  it('does not subscribe the triggering effect to internal row signals', () => {
    const [items, setItems] = createSignal([{ id: 1, title: 'initial' }])
    const [gate, setGate] = createSignal(false)
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)
    let outerRuns = 0

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        effect(() => {
          li.textContent = item().title
        })
        return li
      },
    )

    effect(() => {
      if (!gate()) return
      outerRuns++
      setItems([{ id: 1, title: `from-effect-${outerRuns}` }])
    })

    setGate(true)
    expect(outerRuns).toBe(1)
    expect(root.textContent).toBe('from-effect-1')

    setItems([{ id: 1, title: 'outside' }])

    expect(outerRuns).toBe(1)
    expect(root.textContent).toBe('outside')
  })

  it('tracks committed records when focus restoration throws', () => {
    const [items, setItems] = createSignal([{ id: 1 }])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)
    document.body.append(root)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const input = document.createElement('input')
        input.dataset.id = String(item().id)
        return input
      },
    )

    const focused = root.querySelector<HTMLInputElement>('[data-id="1"]')
    if (!focused) throw new Error('expected a focused keyed input')
    focused.focus()
    const focus = vi.spyOn(focused, 'focus').mockImplementation(() => {
      throw new Error('focus failed')
    })

    expect(() => setItems([{ id: 2 }, { id: 1 }])).toThrow('focus failed')
    focus.mockRestore()
    setItems([{ id: 1 }])

    expect(
      Array.from(root.querySelectorAll('input'), node => node.dataset.id),
    ).toEqual(['1'])
  })

  it('rolls back an initial keyed mount when the devtools hook throws', () => {
    vi.stubGlobal('window', dom.window)
    Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: true,
      value: {
        emit: () => {
          throw new Error('devtools failed')
        },
      },
    })
    const [items] = createSignal([{ id: 1 }])
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)
    let cleanupCount = 0

    expect(() =>
      mountFor(
        root,
        anchor,
        items,
        item => item.id,
        () => {
          const li = document.createElement('li')
          onScopeDispose(() => cleanupCount++)
          return li
        },
      ),
    ).toThrow('devtools failed')

    expect(root.querySelectorAll('li')).toHaveLength(0)
    expect(root.childNodes).toHaveLength(1)
    expect(root.firstChild).toBe(anchor)
    expect(cleanupCount).toBe(1)
  })

  it('moves multi-node keyed ranges and preserves focused descendants', () => {
    const [items, setItems] = createSignal([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ])
    const clone = template('<section><!></section>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)
    document.body.append(root)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const label = document.createElement('span')
        const input = document.createElement('input')
        effect(() => {
          label.textContent = item().title
          input.dataset.id = String(item().id)
        })
        return [label, input]
      },
    )

    const focused = root.querySelector<HTMLInputElement>('[data-id="1"]')
    if (!focused) throw new Error('expected a focusable keyed descendant')
    focused.focus()
    const focus = vi.spyOn(focused, 'focus')
    setItems([
      { id: 2, title: 'b next' },
      { id: 1, title: 'a next' },
    ])

    expect(root.textContent).toBe('b nexta next')
    expect(document.activeElement).toBe(focused)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(
      Array.from(root.querySelectorAll('input')).map(node => node.dataset.id),
    ).toEqual(['2', '1'])
  })

  it('restores the deepest focused element inside a shadow-root list', () => {
    const [items, setItems] = createSignal([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ])
    const host = document.createElement('section')
    const shadow = host.attachShadow({ mode: 'open' })
    const root = document.createElement('div')
    const anchor = document.createComment('')
    root.append(anchor)
    shadow.append(root)
    document.body.append(host)

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const input = document.createElement('input')
        effect(() => {
          input.value = item().title
          input.dataset.id = String(item().id)
        })
        return input
      },
    )

    const focused = root.querySelector<HTMLInputElement>('[data-id="1"]')
    if (!focused) throw new Error('expected a focusable keyed descendant')
    focused.focus()
    const focus = vi.spyOn(focused, 'focus')

    setItems([
      { id: 2, title: 'b next' },
      { id: 1, title: 'a next' },
    ])

    expect(shadow.activeElement).toBe(focused)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('keeps keyed identity through deterministic reorder fuzz', () => {
    type Item = { id: number; title: string }
    const initial = Array.from({ length: 8 }, (_, id) => ({
      id,
      title: `item-${id}:0`,
    }))
    const [items, setItems] = createSignal<Item[]>(initial)
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)
    const identities = new Map<number, Element>()

    mountFor(
      root,
      anchor,
      items,
      item => item.id,
      item => {
        const li = document.createElement('li')
        effect(() => {
          li.dataset.id = String(item().id)
          li.textContent = item().title
        })
        identities.set(item().id, li)
        return li
      },
    )

    for (let step = 1; step <= 40; step++) {
      const previous = items()
      const shift = step % previous.length
      const reordered = previous
        .slice(shift)
        .concat(previous.slice(0, shift))
        .map(item => ({ ...item, title: `item-${item.id}:${step}` }))

      if (step % 3 === 0) reordered.reverse()
      setItems(reordered)

      const rendered = Array.from(root.querySelectorAll('li'))
      expect(
        rendered.map(node => Number(node.getAttribute('data-id'))),
      ).toEqual(reordered.map(item => item.id))
      expect(rendered.map(node => node.textContent)).toEqual(
        reordered.map(item => item.title),
      )
      for (const node of rendered) {
        expect(node).toBe(identities.get(Number(node.getAttribute('data-id'))))
      }
    }
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
        li.textContent = item().title
        return li
      },
    )

    items.splice(0, 1)

    expect(root.textContent).toBe('b')
  })

  it('cleans list nodes when scope stops', async () => {
    const { scope } = await import('@zeus-js/signal/internal')
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
          li.textContent = String(item().id)
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

  it('preserves context owner while rendering list items', () => {
    const Context = createContext<string>()
    const items = state(['a']) as unknown as string[]
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const anchor = marker(root, 0)

    function Item(props: { item: string }) {
      const value = useContext(Context)
      const li = document.createElement('li')
      li.textContent = `${props.item}:${value}`
      return li
    }

    function App() {
      return Context.Provider({
        value: 'provided',
        get children() {
          mountFor(
            root,
            anchor,
            () => items,
            item => item,
            item => createComponent(Item, { item: item() }),
          )

          return root
        },
      })
    }

    createComponent(App, {})
    expect(root.textContent).toBe('a:provided')

    items.push('b')

    expect(root.textContent).toBe('a:providedb:provided')
  })
})
