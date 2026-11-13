import { createSignal, effect, scope, state } from '@zeus-js/signal/internal'
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

describe('bindRef tracking', () => {
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

  /*
   * A ref callback is a mount hook, not a rendering expression. Reading a
   * signal inside one must not make the enclosing effect depend on it.
   *
   * The Admin user form seeds its fields exactly this way —
   * `ref={el => seedValue(el, draft().email)}` — inside `<Show when={editing()}>`.
   * Before this was untracked, every keystroke wrote `draft`, which re-ran the
   * `Show` region and rebuilt the whole dialog. The rebuilt input was a new
   * node with no `dataset.seeded` marker, so it was reseeded from the stale
   * draft, discarding what the user had typed. The submit then compared the
   * old value against the loaded user, found no difference, and sent an empty
   * `PATCH {}` — which is the intermittent CI failure this fixes.
   */
  it('does not make the enclosing effect depend on what the callback reads', () => {
    const [draft, setDraft] = createSignal('a')
    let mounts = 0
    let element: HTMLInputElement | undefined

    effect(() => {
      mounts++
      const el = document.createElement('input')
      element = el
      bindRef(el, (node: HTMLInputElement | null) => {
        if (node) node.value = draft()
      })
    })

    expect(mounts).toBe(1)
    setDraft('b')

    expect(mounts).toBe(1)
    expect(element!.value).toBe('a')
  })

  it('still applies the ref once per mount, and again for a new element', () => {
    const seen: Array<HTMLInputElement | null> = []
    const fn = (el: HTMLInputElement | null): void => {
      seen.push(el)
    }

    const first = document.createElement('input')
    bindRef(first, fn)

    // A rebuild creates a different node; the callback must run for it.
    const second = document.createElement('input')
    bindRef(second, fn)

    expect(seen).toEqual([first, second])
  })
})
