import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSlot } from '../src'

describe('createSlot', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns native slot element when no host context', () => {
    const result = createSlot()
    expect(result).toBeInstanceOf(HTMLSlotElement)
    expect((result as HTMLSlotElement).name).toBe('')
  })

  it('returns named native slot when no host context', () => {
    const result = createSlot('header')
    expect(result).toBeInstanceOf(HTMLSlotElement)
    expect((result as HTMLSlotElement).name).toBe('header')
  })

  it('returns native slot with fallback content', () => {
    const result = createSlot(undefined, () => {
      const span = document.createElement('span')
      span.textContent = 'fallback'
      return span
    })

    expect(result).toBeInstanceOf(HTMLSlotElement)
    const slot = result as HTMLSlotElement
    expect(slot.querySelector('span')!.textContent).toBe('fallback')
  })

  it('returns named slot with fallback', () => {
    const result = createSlot('footer', () => {
      const span = document.createElement('span')
      span.textContent = 'fallback footer'
      return span
    })

    const slot = result as HTMLSlotElement
    expect(slot.name).toBe('footer')
    expect(slot.querySelector('span')!.textContent).toBe('fallback footer')
  })
})
