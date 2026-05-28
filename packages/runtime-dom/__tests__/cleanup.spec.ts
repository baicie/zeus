import { onScopeDispose, scope } from '@zeus-js/signal'
import { state } from '@zeus-js/signal'
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
