import { effect, effectScope, state } from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  bindText,
  bindTextContent,
  bindAttr,
  bindProp,
  bindClass,
  bindStyle,
  normalizeClass,
  setAttr,
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

  describe('once bindings', () => {
    it('evaluates each getter once without creating reactive effects', () => {
      const textValue = state('initial text')
      const textContentValue = state('initial content')
      const attrValue = state('initial title')
      const propValue = state('initial value')
      const classValue = state('initial-class')
      const styleValue = state('red')
      const calls = {
        text: 0,
        textContent: 0,
        attr: 0,
        prop: 0,
        class: 0,
        style: 0,
      }
      const text = document.createTextNode('')
      const content = document.createElement('div')
      const attr = document.createElement('div')
      const prop = document.createElement('input')
      const className = document.createElement('div')
      const style = document.createElement('div')
      const bindingScope = effectScope()

      bindingScope.run(() => {
        bindText(
          text,
          () => {
            calls.text++
            return textValue.value
          },
          true,
        )
        bindTextContent(
          content,
          () => {
            calls.textContent++
            return textContentValue.value
          },
          true,
        )
        bindAttr(
          attr,
          'title',
          () => {
            calls.attr++
            return attrValue.value
          },
          true,
        )
        bindProp(
          prop,
          'value',
          () => {
            calls.prop++
            return propValue.value
          },
          true,
        )
        bindClass(
          className,
          () => {
            calls.class++
            return classValue.value
          },
          true,
        )
        bindStyle(
          style,
          () => {
            calls.style++
            return { color: styleValue.value }
          },
          true,
        )
      })

      expect(calls).toEqual({
        text: 1,
        textContent: 1,
        attr: 1,
        prop: 1,
        class: 1,
        style: 1,
      })
      expect(bindingScope.effects).toHaveLength(0)

      textValue.value = 'updated text'
      textContentValue.value = 'updated content'
      attrValue.value = 'updated title'
      propValue.value = 'updated value'
      classValue.value = 'updated-class'
      styleValue.value = 'blue'

      expect(calls).toEqual({
        text: 1,
        textContent: 1,
        attr: 1,
        prop: 1,
        class: 1,
        style: 1,
      })
      expect(text.data).toBe('initial text')
      expect(content.textContent).toBe('initial content')
      expect(attr.getAttribute('title')).toBe('initial title')
      expect(prop.value).toBe('initial value')
      expect(className.getAttribute('class')).toBe('initial-class')
      expect(style.style.color).toBe('red')

      bindingScope.stop()
    })

    it('does not leak getter dependencies into an outer effect', () => {
      const outer = state(0)
      const inner = state('red')
      const text = document.createTextNode('')
      const content = document.createElement('div')
      const attr = document.createElement('div')
      const prop = document.createElement('input')
      const className = document.createElement('div')
      const style = document.createElement('div')
      const bindingScope = effectScope()
      let outerRuns = 0

      bindingScope.run(() => {
        effect(() => {
          outerRuns++
          outer.value
          bindText(text, () => inner.value, true)
          bindTextContent(content, () => inner.value, true)
          bindAttr(attr, 'title', () => inner.value, true)
          bindProp(prop, 'value', () => inner.value, true)
          bindClass(className, () => inner.value, true)
          bindStyle(style, () => ({ color: inner.value }), true)
        })
      })

      expect(outerRuns).toBe(1)

      inner.value = 'blue'

      expect(outerRuns).toBe(1)
      expect(text.data).toBe('red')
      expect(style.style.color).toBe('red')

      outer.value++

      expect(outerRuns).toBe(2)
      expect(text.data).toBe('blue')
      expect(style.style.color).toBe('blue')

      bindingScope.stop()
    })

    it('uses the same initial value normalization as reactive bindings', () => {
      const reactiveText = document.createTextNode('stale')
      const onceText = document.createTextNode('stale')
      const reactiveContent = document.createElement('div')
      const onceContent = document.createElement('div')
      const reactiveAttr = document.createElement('input')
      const onceAttr = document.createElement('input')
      const reactiveProp = document.createElement('input')
      const onceProp = document.createElement('input')
      const reactiveClass = document.createElement('div')
      const onceClass = document.createElement('div')
      const reactiveStyle = document.createElement('div')
      const onceStyle = document.createElement('div')

      bindText(reactiveText, () => null)
      bindText(onceText, () => null, true)
      bindTextContent(reactiveContent, () => false)
      bindTextContent(onceContent, () => false, true)
      bindAttr(reactiveAttr, 'disabled', () => true)
      bindAttr(onceAttr, 'disabled', () => true, true)
      bindAttr(reactiveAttr, 'title', () => null)
      bindAttr(onceAttr, 'title', () => null, true)
      bindProp(reactiveProp, 'value', () => 'Ada')
      bindProp(onceProp, 'value', () => 'Ada', true)
      bindClass(reactiveClass, () => ['base', { active: true }])
      bindClass(onceClass, () => ['base', { active: true }], true)
      bindStyle(reactiveStyle, () => ({ width: 12, opacity: 0.5 }))
      bindStyle(onceStyle, () => ({ width: 12, opacity: 0.5 }), true)

      expect(onceText.data).toBe(reactiveText.data)
      expect(onceContent.textContent).toBe(reactiveContent.textContent)
      expect(onceAttr.outerHTML).toBe(reactiveAttr.outerHTML)
      expect(onceProp.value).toBe(reactiveProp.value)
      expect(onceClass.getAttribute('class')).toBe(
        reactiveClass.getAttribute('class'),
      )
      expect(onceStyle.style.cssText).toBe(reactiveStyle.style.cssText)
    })
  })

  describe('setAttr', () => {
    it('writes false to non-reflected boolean DOM properties', () => {
      const input = document.createElement('input')

      setAttr(input, 'indeterminate', true)
      expect(input.indeterminate).toBe(true)

      setAttr(input, 'indeterminate', false)
      expect(input.indeterminate).toBe(false)
      expect(input.hasAttribute('indeterminate')).toBe(false)
    })

    it('maps readonly attribute name to readOnly DOM property', () => {
      const input = document.createElement('input')

      setAttr(input, 'readonly', true)
      expect(input.readOnly).toBe(true)

      setAttr(input, 'readonly', false)
      expect(input.readOnly).toBe(false)
      expect(input.hasAttribute('readonly')).toBe(false)
    })

    it('maps readOnly camelCase to readOnly DOM property', () => {
      const input = document.createElement('input')

      setAttr(input, 'readOnly', true)
      expect(input.readOnly).toBe(true)

      setAttr(input, 'readOnly', false)
      expect(input.readOnly).toBe(false)
    })

    it('maps autoFocus camelCase to autofocus DOM property', () => {
      const input = document.createElement('input')

      setAttr(input, 'autoFocus', true)
      expect(input.autofocus).toBe(true)

      setAttr(input, 'autoFocus', false)
      expect(input.autofocus).toBe(false)
    })

    it('maps novalidate lowercase to noValidate DOM property', () => {
      const form = document.createElement('form')

      setAttr(form, 'novalidate', true)
      expect(
        (form as HTMLFormElement & { noValidate: boolean }).noValidate,
      ).toBe(true)

      setAttr(form, 'novalidate', false)
      expect(
        (form as HTMLFormElement & { noValidate: boolean }).noValidate,
      ).toBe(false)
    })

    it('writes true to boolean reflected property with empty attribute', () => {
      const input = document.createElement('input')

      setAttr(input, 'disabled', true)
      expect(input.disabled).toBe(true)
      expect(input.hasAttribute('disabled')).toBe(true)
    })

    it('removes reflected boolean property attribute on false', () => {
      const input = document.createElement('input')

      setAttr(input, 'disabled', true)
      setAttr(input, 'disabled', false)
      expect(input.disabled).toBe(false)
      expect(input.hasAttribute('disabled')).toBe(false)
    })

    it('writes false to boolean property when boolean false is passed', () => {
      const el = document.createElement('div')

      setAttr(el, 'hidden', true)
      expect(el.hidden).toBe(true)

      setAttr(el, 'hidden', false)
      expect(el.hidden).toBe(false)
    })

    it('normalizes className to class for non-boolean paths', () => {
      const el = document.createElement('div')

      setAttr(el, 'className', 'foo')
      expect(el.getAttribute('class')).toBe('foo')
    })

    it('removes attribute when value is null', () => {
      const el = document.createElement('div')
      el.setAttribute('title', 'hello')

      setAttr(el, 'title', null)
      expect(el.getAttribute('title')).toBeNull()
    })

    it('removes attribute when value is false', () => {
      const el = document.createElement('div')
      el.setAttribute('title', 'hello')

      setAttr(el, 'title', false)
      expect(el.getAttribute('title')).toBeNull()
    })

    it('sets string attribute', () => {
      const el = document.createElement('div')

      setAttr(el, 'data-id', '123')
      expect(el.getAttribute('data-id')).toBe('123')
    })
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
