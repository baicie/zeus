import { state } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  bindText,
  bindAttr,
  bindClass,
  bindStyle,
  normalizeClass,
} from '../src'

describe('runtime bindings', () => {
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

  it('binds text reactively', () => {
    const count = state(0)
    const text = document.createTextNode('')

    bindText(text, () => count.value)

    expect(text.data).toBe('0')

    count.value++

    expect(text.data).toBe('1')
  })

  it('binds text to empty string for null/undefined', () => {
    const val = state<string | null>('hello')
    const text = document.createTextNode('')

    bindText(text, () => val.value)

    expect(text.data).toBe('hello')

    val.value = null

    expect(text.data).toBe('')
  })

  it('binds attr reactively', () => {
    const title = state('hello')
    const el = document.createElement('div')

    bindAttr(el, 'title', () => title.value)

    expect(el.getAttribute('title')).toBe('hello')

    title.value = 'world'

    expect(el.getAttribute('title')).toBe('world')
  })

  it('removes attr when value is null', () => {
    const value = state<string | null>('hello')
    const el = document.createElement('div')
    el.setAttribute('title', 'hello')

    bindAttr(el, 'title', () => value.value)

    expect(el.getAttribute('title')).toBe('hello')

    value.value = null

    expect(el.getAttribute('title')).toBeNull()
  })

  it('sets boolean attribute', () => {
    const value = state(true)
    const el = document.createElement('input')

    bindAttr(el, 'disabled', () => value.value)

    expect(el.getAttribute('disabled')).toBe('')

    value.value = false

    expect(el.getAttribute('disabled')).toBeNull()
  })

  it('normalizes className to class', () => {
    const value = state('foo')
    const el = document.createElement('div')

    bindAttr(el, 'className', () => value.value)

    expect(el.getAttribute('class')).toBe('foo')
  })

  it('binds class string', () => {
    const cls = state('active')
    const el = document.createElement('div')

    bindClass(el, () => cls.value)

    expect(el.getAttribute('class')).toBe('active')

    cls.value = 'disabled'

    expect(el.getAttribute('class')).toBe('disabled')
  })

  it('binds class object', () => {
    const active = state(false)
    const el = document.createElement('div')

    bindClass(el, () => ({
      active: active.value,
    }))

    expect(el.getAttribute('class')).toBeNull()

    active.value = true

    expect(el.getAttribute('class')).toBe('active')
  })

  it('binds class array', () => {
    const condition = state(true)
    const el = document.createElement('div')

    bindClass(el, () => ['a', condition.value && 'b'])

    expect(el.getAttribute('class')).toBe('a b')

    condition.value = false

    expect(el.getAttribute('class')).toBe('a')
  })

  it('removes class attribute when normalized value is empty', () => {
    const value = state<Record<string, boolean>>({})
    const el = document.createElement('div')
    el.setAttribute('class', 'old')

    bindClass(el, () => value.value as import('../src').ClassValue)

    expect(el.getAttribute('class')).toBeNull()
  })

  it('binds style string', () => {
    const styleStr = state('color:red')
    const el = document.createElement('div')

    bindStyle(el, () => styleStr.value)

    expect(el.getAttribute('style')).toBe('color:red')

    styleStr.value = 'color:blue'

    expect(el.getAttribute('style')).toBe('color:blue')
  })

  it('binds style object', () => {
    const width = state(100)
    const el = document.createElement('div')

    bindStyle(el, () => ({
      width: width.value,
    }))

    expect(el.style.width).toBe('100px')

    width.value = 200

    expect(el.style.width).toBe('200px')
  })

  it('removes style when null', () => {
    const value = state<Record<string, string> | null>({ color: 'red' })
    const el = document.createElement('div')

    bindStyle(el, () => value.value)

    value.value = null

    expect(el.getAttribute('style') || '').toBe('')
  })

  it('patches style diff correctly', () => {
    const value = state({ color: 'red', fontSize: '14px' }) as unknown as {
      value: Record<string, string>
    }
    const el = document.createElement('div')

    bindStyle(el, () => value.value)
    ;(value.value as Record<string, string>) = { color: 'blue' }

    expect(el.style.cssText).toContain('color')
    expect(el.style.cssText).not.toContain('font-size')
  })

  it('handles camelCase style keys', () => {
    const value = state('red')
    const el = document.createElement('div')

    bindStyle(el, () => ({
      backgroundColor: value.value,
    }))

    expect(el.style.backgroundColor).toBe('red')
  })

  it('handles numeric style values with px', () => {
    const value = state(100)
    const el = document.createElement('div')

    bindStyle(el, () => ({
      width: value.value,
    }))

    expect(el.style.width).toBe('100px')
  })

  it('does not add px to unitless numbers', () => {
    const value = state(1)
    const el = document.createElement('div')

    bindStyle(el, () => ({
      opacity: value.value,
      zIndex: value.value,
    }))

    expect(el.style.opacity).toBe('1')
    expect(el.style.zIndex).toBe('1')
  })
})

describe('normalizeClass', () => {
  it('returns empty string for falsy values', () => {
    expect(normalizeClass(null)).toBe('')
    expect(normalizeClass(undefined)).toBe('')
    expect(normalizeClass(false)).toBe('')
  })

  it('returns string as-is', () => {
    expect(normalizeClass('foo bar')).toBe('foo bar')
  })

  it('flattens arrays', () => {
    expect(normalizeClass(['a', 'b'])).toBe('a b')
    expect(normalizeClass(['a', false, 'b', null])).toBe('a b')
  })

  it('filters object keys by truthy values', () => {
    expect(normalizeClass({ active: true, disabled: false })).toBe('active')
    expect(
      normalizeClass({
        a: 1,
        b: 0,
        c: null,
        d: undefined,
      } as unknown as import('../src').ClassValue),
    ).toBe('a')
  })
})
