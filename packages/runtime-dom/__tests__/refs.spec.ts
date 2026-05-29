import { scope, state } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindRef } from '../src'

describe('bindRef', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('sets and clears value state ref on scope stop', () => {
    const input = state<HTMLInputElement | null>(null)
    const el = document.createElement('input')
    const s = scope()

    s.run(() => {
      bindRef(el, input)
    })

    expect(input.value).toBe(el)

    s.stop()

    expect(input.value).toBe(null)
  })

  it('sets and clears current object ref on scope stop', () => {
    const ref = {
      current: null as HTMLInputElement | null,
    }
    const el = document.createElement('input')
    const s = scope()

    s.run(() => {
      bindRef(el, ref)
    })

    expect(ref.current).toBe(el)

    s.stop()

    expect(ref.current).toBe(null)
  })

  it('calls callback ref with element on bind and null on stop', () => {
    const fn = vi.fn()
    const el = document.createElement('input')
    const s = scope()

    s.run(() => {
      bindRef(el, fn)
    })

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(el)

    s.stop()

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(null)
  })

  it('handles null ref target gracefully', () => {
    const el = document.createElement('input')
    const s = scope()

    s.run(() => {
      bindRef(el, null)
      bindRef(el, undefined)
    })

    expect(true).toBe(true)

    s.stop()
  })
})
