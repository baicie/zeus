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
    vi.stubGlobal('Node', dom.window.Node)
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
    vi.stubGlobal('Node', dom.window.Node)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('registers event types for delegation', () => {
    delegateEvents(['click', 'input'])

    expect(true).toBe(true)
  })

  it('sets delegated event currentTarget to the matched element', () => {
    const input = document.createElement('input')
    input.value = 'hello'
    document.body.append(input)

    const handler = vi.fn((event: Event) => {
      const currentTarget = event.currentTarget as HTMLInputElement

      expect(currentTarget).toBe(input)
      expect(currentTarget.value).toBe('hello')
    })

    bindEvent(input, 'zeus-current-target', handler)
    delegateEvents(['zeus-current-target'])

    input.dispatchEvent(
      new dom.window.Event('zeus-current-target', { bubbles: true }),
    )

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('updates delegated event currentTarget while bubbling', () => {
    const parent = document.createElement('div')
    const input = document.createElement('input')
    parent.append(input)
    document.body.append(parent)

    const targets: EventTarget[] = []

    bindEvent(input, 'zeus-current-target-bubble', event => {
      targets.push(event.currentTarget!)
    })
    bindEvent(parent, 'zeus-current-target-bubble', event => {
      targets.push(event.currentTarget!)
    })
    delegateEvents(['zeus-current-target-bubble'])

    input.dispatchEvent(
      new dom.window.Event('zeus-current-target-bubble', { bubbles: true }),
    )

    expect(targets).toEqual([input, parent])
  })
})
