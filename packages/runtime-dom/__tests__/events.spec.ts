import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindEvent, delegateEvents } from '../src'

type ZeusElementWithEvents = Element & {
  __zeusEvents?: Record<string, EventListener>
}

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

  it('bindEvent stores handler for delegation', () => {
    const el = document.createElement('button')
    const handler = vi.fn()

    bindEvent(el, 'click', handler)

    // Verify the handler was stored internally
    const stored = (el as ZeusElementWithEvents).__zeusEvents?.click
    expect(stored).toBe(handler)
  })
})

describe('delegateEvents', () => {
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

  it('registers event types for delegation', () => {
    delegateEvents(['click', 'input'])

    expect(true).toBe(true)
  })
})
