import { createRoot, createSignal } from '@zeus-js/signal'
import { effect } from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { reactive as proxy } from '../../signal/src/reactive'
import { bindSpread, mergeProps } from '../src/spread'

describe('ordered JSX spread', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes platform attribute aliases before applying source precedence', () => {
    const dom = new JSDOM('<label></label>')
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    const label = dom.window.document.querySelector('label')!
    createRoot(dispose => {
      bindSpread(label, [
        () => ({ htmlFor: 'first', for: 'last', tabIndex: 2 }),
      ])
      expect(label.getAttribute('for')).toBe('last')
      expect(label.hasAttribute('htmlfor')).toBe(false)
      expect(label.getAttribute('tabindex')).toBe('2')
      dispose()
    })
    dom.window.close()
  })

  it('updates attributes in source order, removes missing keys and preserves function properties', () => {
    const dom = new JSDOM('<div></div>')
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    const el = dom.window.document.querySelector('div')!
    const callback = vi.fn()
    const [first, setFirst] = createSignal<Record<string, unknown>>({
      id: 'base',
      title: 'first',
      class: 'base',
    })
    const [last, setLast] = createSignal<Record<string, unknown>>({
      title: 'last',
      class: 'last',
      'prop:formatter': callback,
    })
    createRoot(dispose => {
      bindSpread(el, [first, () => ({ id: 'fixed' }), last])
      expect(el.id).toBe('fixed')
      expect(el.title).toBe('last')
      expect(el.className).toBe('last')
      expect(Reflect.get(el, 'formatter')).toBe(callback)
      expect(callback).not.toHaveBeenCalled()
      setLast({ title: undefined })
      expect(el.hasAttribute('title')).toBe(false)
      expect(el.className).toBe('base')
      expect(Reflect.get(el, 'formatter')).toBeUndefined()
      setFirst({ id: 'new', title: 'hidden' })
      expect(el.id).toBe('fixed')
      expect(el.hasAttribute('class')).toBe(false)
      dispose()
      setFirst({ id: 'ignored', title: 'ignored' })
      expect(el.id).toBe('fixed')
    })
    dom.window.close()
  })

  it('replaces events and refs and detaches both when disposed', () => {
    const dom = new JSDOM('<button></button>')
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    const el = dom.window.document.querySelector('button')!
    const first = vi.fn()
    const second = vi.fn()
    const oldRef = vi.fn()
    const newRef = vi.fn()
    const [props, setProps] = createSignal({ onClick: first, ref: oldRef })
    createRoot(dispose => {
      bindSpread(el, [props])
      el.click()
      expect(first).toHaveBeenCalledTimes(1)
      setProps({ onClick: second, ref: newRef })
      expect(oldRef.mock.calls).toEqual([[el], [null]])
      expect(newRef.mock.calls).toEqual([[el]])
      el.click()
      expect(first).toHaveBeenCalledTimes(1)
      expect(second).toHaveBeenCalledTimes(1)
      dispose()
      expect(newRef.mock.calls).toEqual([[el], [null]])
      el.click()
      expect(second).toHaveBeenCalledTimes(1)
    })
    dom.window.close()
  })

  it('tracks dynamic component keys, getters and same-object field changes', () => {
    const [count, setCount] = createSignal(0)
    const dynamic = proxy<Record<string, unknown>>({ title: 'base' })
    const [later, setLater] = createSignal<Record<string, unknown>>(dynamic)
    const source = vi.fn(() => ({
      get value() {
        return count()
      },
    }))
    const props = mergeProps([source, later])
    const observed: unknown[] = []
    createRoot(dispose => {
      effect(() =>
        observed.push([
          props.value,
          props.title,
          'extra' in props,
          Object.keys(props).sort(),
        ]),
      )
      expect(source).toHaveBeenCalledTimes(1)
      setCount(1)
      dynamic.title = 'changed'
      dynamic.extra = 1
      delete dynamic.title
      setLater({ value: undefined })
      expect(observed[observed.length - 1]).toEqual([
        undefined,
        undefined,
        false,
        ['value'],
      ])
      expect(
        observed.some(value => JSON.stringify(value).includes('changed')),
      ).toBe(true)
      expect(source).toHaveBeenCalledTimes(1)
      dispose()
    })
  })

  it('cleans events and mounted refs if applying a ref throws', () => {
    const dom = new JSDOM('<button></button>')
    const el = dom.window.document.querySelector('button')!
    const clicked = vi.fn()
    const ref = vi.fn((value: Element | null) => {
      if (value) throw new Error('ref failed')
    })
    expect(() =>
      createRoot(() => bindSpread(el, [() => ({ onClick: clicked, ref })])),
    ).toThrow('ref failed')
    el.click()
    expect(clicked).not.toHaveBeenCalled()
    expect(ref.mock.calls).toEqual([[el], [null]])
    dom.window.close()
  })
})

describe('spread reentrant disposal', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('does not attach later bindings when the mount ref disposes its owner', () => {
    const dom = new JSDOM('<button></button>')
    const el = dom.window.document.querySelector('button')!
    const clicked = vi.fn()
    const reference = vi.fn()
    createRoot(dispose => {
      bindSpread(el, [
        () => ({
          ref: (node: Element | null) => {
            reference(node)
            if (node) dispose()
          },
          onClick: clicked,
          title: 'after',
        }),
      ])
    })
    el.click()
    expect(clicked).not.toHaveBeenCalled()
    expect(el.hasAttribute('title')).toBe(false)
    expect(reference.mock.calls).toEqual([[el], [null]])
    dom.window.close()
  })

  it('does not mount the replacement ref after the previous ref disposes its owner', () => {
    const dom = new JSDOM('<button></button>')
    const el = dom.window.document.querySelector('button')!
    const replacement = vi.fn()
    const clicked = vi.fn()
    createRoot(dispose => {
      const original = (node: Element | null) => {
        if (!node) dispose()
      }
      const [props, update] = createSignal<{
        ref: (node: Element | null) => void
        onClick?: () => void
      }>({ ref: original })
      bindSpread(el, [props])
      update({ ref: replacement, onClick: clicked })
    })
    el.click()
    expect(replacement).not.toHaveBeenCalled()
    expect(clicked).not.toHaveBeenCalled()
    dom.window.close()
  })

  it('applies reflected property and attribute channels in their latest source order', () => {
    const dom = new JSDOM('<input>')
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    const input = dom.window.document.querySelector('input')!
    const [props, update] = createSignal({
      'prop:disabled': true,
      disabled: false,
    })
    createRoot(dispose => {
      bindSpread(input, [
        () => ({ disabled: true }),
        props,
        () => ({ disabled: false }),
      ])
      expect(input.disabled).toBe(false)
      update({ 'prop:disabled': false, disabled: true })
      expect(input.disabled).toBe(false)
      update({ 'prop:disabled': true, disabled: false })
      expect(input.disabled).toBe(false)
      dispose()
    })
    dom.window.close()
  })
})

it('evaluates once sources in their original order and caches only their first value', () => {
  const dom = new JSDOM('<div></div>')
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  const el = dom.window.document.querySelector('div')!
  const calls: string[] = []
  const [value, update] = createSignal('initial')
  createRoot(dispose => {
    bindSpread(
      el,
      [
        () => {
          calls.push('first')
          return { title: value() }
        },
        () => {
          calls.push('second')
          return { id: value() }
        },
        () => ({}),
      ],
      [1],
    )
    expect(calls).toEqual(['first', 'second'])
    update('next')
    expect(calls).toEqual(['first', 'second', 'first'])
    expect(el.id).toBe('initial')
    expect(el.title).toBe('next')
    dispose()
  })
  vi.unstubAllGlobals()
  dom.window.close()
})

it('commits signal writes from ref callbacks before bindSpread returns', () => {
  const dom = new JSDOM('<div></div>')
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  const el = dom.window.document.querySelector('div')!
  const [mounted, setMounted] = createSignal(false)
  const reference = vi.fn((node: Element | null) => {
    if (node) setMounted(true)
  })
  createRoot(dispose => {
    bindSpread(el, [
      () => ({ ref: reference }),
      () => ({ 'data-mounted': mounted() }),
      () => ({}),
    ])
    expect(mounted()).toBe(true)
    expect(el.hasAttribute('data-mounted')).toBe(true)
    expect(reference.mock.calls).toEqual([[el]])
    dispose()
    expect(reference.mock.calls).toEqual([[el], [null]])
  })
  vi.unstubAllGlobals()
  dom.window.close()
})
