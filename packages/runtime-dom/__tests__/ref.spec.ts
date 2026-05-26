import { state, scope } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindRef, setRef } from '../src'

import type { RefTarget } from '../src'

describe('setRef', () => {
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

  it('sets value state ref', () => {
    const el = document.createElement('input')
    const input = state<HTMLInputElement | null>(null)

    setRef(input, el)

    expect(input.value).toBe(el)
  })

  it('sets value state ref to null', () => {
    const el = document.createElement('input')
    const input = state<HTMLInputElement | null>(el)

    setRef(input, null)

    expect(input.value).toBe(null)
  })

  it('sets callback ref', () => {
    const el = document.createElement('input')
    const fn = vi.fn()

    setRef(fn, el)

    expect(fn).toHaveBeenCalledWith(el)
  })

  it('sets callback ref to null', () => {
    const el = document.createElement('input')
    const fn = vi.fn()

    setRef(fn, el)
    expect(fn).toHaveBeenCalledWith(el)

    setRef(fn, null)
    expect(fn).toHaveBeenCalledWith(null)
  })

  it('sets current object ref', () => {
    const el = document.createElement('input')
    const input = { current: null as HTMLInputElement | null }

    setRef(input, el)

    expect(input.current).toBe(el)
  })

  it('ignores null target', () => {
    setRef(null, document.createElement('div'))
  })

  it('ignores undefined target', () => {
    setRef(undefined, document.createElement('div'))
  })

  it('warns on invalid ref target in dev mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('input')
    const invalid = { foo: 'bar' } as unknown as RefTarget<unknown>

    setRef(invalid, el)

    expect(warn).toHaveBeenCalledWith(
      '[Zeus runtime] Invalid ref target:',
      invalid,
    )
    warn.mockRestore()
  })
})

describe('bindRef', () => {
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

  it('sets ref and registers cleanup on scope', () => {
    const el = document.createElement('input')
    const input = state<HTMLInputElement | null>(null)

    const s = scope()

    s.run(() => {
      bindRef(el, input)
    })

    expect(input.value).toBe(el)

    s.stop()

    expect(input.value).toBe(null)
  })

  it('sets ref without scope (no-op cleanup)', () => {
    const el = document.createElement('input')
    const input = state<HTMLInputElement | null>(null)

    bindRef(el, input)

    expect(input.value).toBe(el)
  })

  it('supports callback ref with scope cleanup', () => {
    const el = document.createElement('input')
    const fn = vi.fn()

    const s = scope()

    s.run(() => {
      bindRef(el, fn)
    })

    expect(fn).toHaveBeenCalledWith(el)

    s.stop()

    expect(fn).toHaveBeenCalledWith(null)
  })

  it('supports current object ref with scope cleanup', () => {
    const el = document.createElement('input')
    const input = { current: null as HTMLInputElement | null }

    const s = scope()

    s.run(() => {
      bindRef(el, input)
    })

    expect(input.current).toBe(el)

    s.stop()

    expect(input.current).toBe(null)
  })
})
