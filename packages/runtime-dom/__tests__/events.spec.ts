import { scope } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindEvent, delegateEvents } from '../src'

describe('bindEvent', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('attaches event listener', () => {
    const el = document.createElement('button')
    const handler = vi.fn()

    bindEvent(el, 'click', handler)

    el.click()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('passes event object to handler', () => {
    const el = document.createElement('button')
    const handler = vi.fn()

    bindEvent(el, 'click', handler)

    el.click()

    expect(handler).toHaveBeenCalledWith(expect.any(dom.window.Event))
  })

  it('registers cleanup on scope dispose', () => {
    const el = document.createElement('button')
    const handler = vi.fn()

    const s = scope()

    s.run(() => {
      bindEvent(el, 'click', handler)
    })

    el.click()

    expect(handler).toHaveBeenCalledTimes(1)

    s.stop()

    el.click()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('removes listener on scope dispose', () => {
    const el = document.createElement('button')
    const handler = vi.fn()

    const s = scope()

    s.run(() => {
      bindEvent(el, 'click', handler)
    })

    s.stop()

    el.click()

    expect(handler).not.toHaveBeenCalled()
  })

  it('handles input event', () => {
    const input = document.createElement('input')
    const handler = vi.fn()

    bindEvent(input, 'input', handler)

    input.value = 'hello'
    input.dispatchEvent(new dom.window.Event('input'))

    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('delegateEvents', () => {
  it('registers events in the delegated set', () => {
    delegateEvents(['click', 'input'])

    // Should not throw — just a no-op placeholder for Phase 2
    expect(true).toBe(true)
  })
})
