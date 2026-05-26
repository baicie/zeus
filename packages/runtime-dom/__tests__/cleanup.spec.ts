import { scope } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindEvent, bindRef, mountFor } from '../src'

type ZeusElementWithEvents = Element & {
  __zeusEvents?: Record<string, EventListener>
}

describe('runtime cleanup', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    s.run(() => {
      mountFor(
        parent,
        marker,
        () => [{ id: 1 }],
        item => item.id,
        item => {
          const li = document.createElement('li')
          li.textContent = String(item.id)
          return li
        },
      )
    })

    expect(parent.childNodes.length).toBe(2)

    s.stop()

    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(marker)
  })
})
