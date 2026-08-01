import {
  effect,
  onCleanup,
  onScopeDispose,
  scope,
  state,
} from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bindEvent,
  bindRef,
  bindText,
  mountFor,
  mountShow,
  render,
} from '../src'
import { marker } from '../src/dom'
import { template } from '../src/template'

type ZeusElementWithEvents = Element & {
  __zeusEvents?: Record<string, EventListener>
}

describe('runtime cleanup', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('customElements', {
      get: vi.fn(),
      define: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('clears event handler on scope stop', () => {
    const s = scope()
    const button = document.createElement('button')
    const fn = vi.fn()

    s.run(() => {
      bindEvent(button, 'click', fn)
    })

    const handlerBefore = (button as ZeusElementWithEvents).__zeusEvents?.click
    expect(handlerBefore).toBe(fn)

    s.stop()

    const handlerAfter = (button as ZeusElementWithEvents).__zeusEvents?.click
    expect(handlerAfter).toBeUndefined()
  })

  it('clears ref on scope stop', () => {
    const s = scope()
    const el = document.createElement('input')
    const ref = { value: null as HTMLElement | null }

    s.run(() => {
      bindRef(el, ref as unknown as Parameters<typeof bindRef>[1])
    })

    expect(ref.value).toBe(el)

    s.stop()

    expect(ref.value).toBe(null)
  })

  it('removes list nodes on scope stop', () => {
    const s = scope()
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    s.run(() => {
      mountFor(
        root,
        m,
        () => [{ id: 1 }],
        item => item.id,
        item => {
          const li = document.createElement('li')
          li.textContent = String(item.id)
          return li
        },
      )
    })

    expect(root.childNodes.length).toBe(2)

    s.stop()

    expect(root.childNodes.length).toBe(1)
    expect(root.firstChild).toBe(m)
  })

  it('disposes keyed item scopes when records leave the list', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }])
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        item => item.id,
        item => {
          onScopeDispose(() => {
            disposedItems.push(item.id)
          })

          const li = document.createElement('li')
          li.textContent = String(item.id)
          return li
        },
      )
    })

    items.splice(0, 1)

    expect(disposedItems).toEqual([1])

    listScope.stop()

    expect(disposedItems).toEqual([1, 2])
  })

  it('disposes Show branch resources on every truthy/fallback switch', () => {
    const showScope = scope()
    const visible = state(true)
    const pulse = state(0)
    const effectRuns: string[] = []
    const disposedBranches: string[] = []
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    const renderBranch = (name: 'truthy' | 'fallback') => {
      effect(() => {
        effectRuns.push(`${name}:${pulse.value}`)
      })
      onCleanup(() => {
        disposedBranches.push(name)
      })

      return document.createTextNode(name)
    }

    showScope.run(() => {
      mountShow(
        root,
        m,
        () => visible.value,
        () => renderBranch('truthy'),
        () => renderBranch('fallback'),
      )
    })

    visible.value = false
    visible.value = true
    visible.value = false
    visible.value = true

    expect(disposedBranches).toEqual([
      'truthy',
      'fallback',
      'truthy',
      'fallback',
    ])

    effectRuns.length = 0
    pulse.value++

    expect(effectRuns).toEqual(['truthy:1'])

    showScope.stop()
    expect(disposedBranches).toEqual([
      'truthy',
      'fallback',
      'truthy',
      'fallback',
      'truthy',
    ])
  })

  it('disposes every old unkeyed item when the list is replaced', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }])
    const pulse = state(0)
    const effectRuns: number[] = []
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        undefined,
        item => {
          effect(() => {
            pulse.value
            effectRuns.push(item.id)
          })
          onCleanup(() => {
            disposedItems.push(item.id)
          })

          return document.createElement('li')
        },
      )
    })

    items.splice(0, items.length, { id: 3 }, { id: 4 })

    expect(disposedItems).toEqual([1, 2])

    effectRuns.length = 0
    pulse.value++

    expect(effectRuns).toEqual([3, 4])
    listScope.stop()
  })

  it('disposes every old unkeyed item when the list shrinks', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }, { id: 3 }])
    const pulse = state(0)
    const effectRuns: number[] = []
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        undefined,
        item => {
          effect(() => {
            pulse.value
            effectRuns.push(item.id)
          })
          onCleanup(() => {
            disposedItems.push(item.id)
          })

          return document.createElement('li')
        },
      )
    })

    items.splice(1, 2)

    expect(disposedItems).toEqual([1, 2, 3])

    effectRuns.length = 0
    pulse.value++

    expect(effectRuns).toEqual([1])
    listScope.stop()
  })

  it('disposes every old unkeyed item when the list is cleared', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }])
    const pulse = state(0)
    const effectRuns: number[] = []
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        undefined,
        item => {
          effect(() => {
            pulse.value
            effectRuns.push(item.id)
          })
          onCleanup(() => {
            disposedItems.push(item.id)
          })

          return document.createElement('li')
        },
      )
    })

    items.splice(0, items.length)

    expect(disposedItems).toEqual([1, 2])

    effectRuns.length = 0
    pulse.value++

    expect(effectRuns).toEqual([])
    listScope.stop()
  })

  it('runs public cleanup only for keyed records removed from the list', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }, { id: 3 }])
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        item => item.id,
        item => {
          onCleanup(() => {
            disposedItems.push(item.id)
          })

          return document.createElement('li')
        },
      )
    })

    items.splice(1, 1)

    expect(disposedItems).toEqual([2])

    listScope.stop()
    expect(disposedItems).toEqual([2, 1, 3])
  })

  it('does not run public cleanup when keyed records only move', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }, { id: 3 }])
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        item => item.id,
        item => {
          onCleanup(() => {
            disposedItems.push(item.id)
          })

          return document.createElement('li')
        },
      )
    })

    const [first, second, third] = items
    items.splice(0, items.length, third, first, second)

    expect(disposedItems).toEqual([])

    listScope.stop()
    expect(disposedItems).toEqual([3, 1, 2])
  })

  it('removes old Show nodes when condition toggles from truthy to falsy', () => {
    const flag = state(true)
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    mountShow(
      root,
      m,
      () => flag.value,
      () => {
        const span = document.createElement('span')
        span.textContent = 'visible'
        return span
      },
      () => {
        const em = document.createElement('em')
        em.textContent = 'hidden'
        return em
      },
    )

    expect(root.textContent).toBe('visible')

    flag.value = false

    expect(root.textContent).toBe('hidden')
    expect(root.querySelector('span')).toBeNull()
  })

  it('dispose render stops bound text effects', () => {
    const container = document.createElement('div')
    const count = { value: 0 }
    const text = document.createTextNode('')

    const dispose = render(() => {
      bindText(text, () => count.value)
      return text
    }, container)

    expect(text.data).toBe('0')

    dispose()

    count.value = 42

    expect(text.data).toBe('0')
  })

  it('onScopeDispose callback runs when scope is stopped', () => {
    const s = scope()
    let disposed = false

    s.run(() => {
      onScopeDispose(() => {
        disposed = true
      })
    })

    expect(disposed).toBe(false)

    s.stop()

    expect(disposed).toBe(true)
  })

  it('render dispose stops all bound effects', () => {
    const container = document.createElement('div')
    const count = state(0)
    const text = document.createTextNode('')

    const dispose = render(() => {
      bindText(text, () => count.value)
      return text
    }, container)

    expect(text.data).toBe('0')
    count.value = 42
    expect(text.data).toBe('42')

    dispose()

    count.value = 99

    expect(text.data).toBe('42')
  })
})
