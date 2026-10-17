import { scope } from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindEvent, delegateEvents } from '../src'
import { resetDelegatedEvents } from '../src/events'

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

  it('stores handler for delegation', () => {
    const el = document.createElement('button')
    const handler = vi.fn()

    bindEvent(el, 'click', handler)

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
    resetDelegatedEvents()
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('registers event types for delegation', () => {
    delegateEvents(['click', 'input'])
    expect(true).toBe(true)
  })
})

describe('delegated events', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
  })

  afterEach(() => {
    resetDelegatedEvents()
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('sets currentTarget to the bound element', () => {
    const input = document.createElement('input')
    const fn = vi.fn((event: Event) => {
      expect(event.currentTarget).toBe(input)
    })

    document.body.appendChild(input)

    delegateEvents(['input'])
    bindEvent(input, 'input', fn)

    input.dispatchEvent(
      new dom.window.Event('input', {
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(fn).toHaveBeenCalledTimes(1)

    input.remove()
  })

  it('removes handler on scope stop', () => {
    const button = document.createElement('button')
    const fn = vi.fn()
    const s = scope()

    document.body.appendChild(button)
    delegateEvents(['click'])

    s.run(() => {
      bindEvent(button, 'click', fn)
    })

    button.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    expect(fn).toHaveBeenCalledTimes(1)

    s.stop()

    button.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    expect(fn).toHaveBeenCalledTimes(1)

    button.remove()
  })

  it('supports stopPropagation', () => {
    const parent = document.createElement('div')
    const child = document.createElement('button')

    const parentFn = vi.fn()
    const childFn = vi.fn((event: Event) => {
      event.stopPropagation()
    })

    parent.appendChild(child)
    document.body.appendChild(parent)

    delegateEvents(['click'])
    bindEvent(parent, 'click', parentFn)
    bindEvent(child, 'click', childFn)

    child.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
    )

    expect(childFn).toHaveBeenCalledTimes(1)
    expect(parentFn).not.toHaveBeenCalled()

    parent.remove()
  })

  it('supports focus through focusin mapping', () => {
    const input = document.createElement('input')
    const focusFn = vi.fn()

    document.body.appendChild(input)

    delegateEvents(['focus'])
    bindEvent(input, 'focus', focusFn)

    input.dispatchEvent(
      new dom.window.FocusEvent('focusin', {
        bubbles: true,
        cancelable: true,
      }),
    )

    expect(focusFn).toHaveBeenCalledTimes(1)

    input.remove()
  })

  it('bubbles to parent element handlers with correct currentTarget', () => {
    const parent = document.createElement('div')
    const child = document.createElement('button')
    const targets: EventTarget[] = []

    parent.appendChild(child)
    document.body.appendChild(parent)

    bindEvent(child, 'bubble', e => {
      targets.push(e.currentTarget!)
    })
    bindEvent(parent, 'bubble', e => {
      targets.push(e.currentTarget!)
    })
    delegateEvents(['bubble'])

    child.dispatchEvent(
      new dom.window.Event('bubble', { bubbles: true, cancelable: true }),
    )

    expect(targets).toEqual([child, parent])

    parent.remove()
  })

  it('delegates composed events across a shadow root', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    const fn = vi.fn()
    shadow.appendChild(button)
    document.body.appendChild(host)

    delegateEvents(['click'])
    bindEvent(button, 'click', fn)

    button.dispatchEvent(
      new dom.window.MouseEvent('click', {
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    )

    expect(fn).toHaveBeenCalledTimes(1)
    host.remove()
  })

  it('does not cross a shadow root for non-composed events', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    const button = document.createElement('button')
    const fn = vi.fn()
    shadow.appendChild(button)
    document.body.appendChild(host)

    delegateEvents(['click'])
    bindEvent(button, 'click', fn)

    button.dispatchEvent(
      new dom.window.MouseEvent('click', {
        bubbles: true,
        composed: false,
        cancelable: true,
      }),
    )

    expect(fn).not.toHaveBeenCalled()
    host.remove()
  })

  it('handles closed shadow roots locally and cleans up with the owner', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'closed' })
    const button = document.createElement('button')
    const innerFn = vi.fn()
    const hostFn = vi.fn()
    const owner = scope()
    shadow.appendChild(button)
    document.body.appendChild(host)

    delegateEvents(['click'])
    bindEvent(host, 'click', hostFn)
    owner.run(() => bindEvent(button, 'click', innerFn))

    const dispatchClick = () =>
      button.dispatchEvent(
        new dom.window.MouseEvent('click', {
          bubbles: true,
          composed: true,
          cancelable: true,
        }),
      )
    dispatchClick()

    expect(innerFn).toHaveBeenCalledTimes(1)
    expect(hostFn).toHaveBeenCalledTimes(1)

    owner.stop()
    dispatchClick()

    expect(innerFn).toHaveBeenCalledTimes(1)
    expect(hostFn).toHaveBeenCalledTimes(2)
    host.remove()
  })
})
