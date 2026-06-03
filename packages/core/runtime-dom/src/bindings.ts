import { effect } from '@zeus-js/signal'

import type { AttrValue, ClassValue, JSXValue, StyleValue } from './types'

export function bindText(node: Text, value: () => JSXValue): void {
  effect(() => {
    node.data = stringifyText(value())
  })
}

export function bindTextContent(el: Node, value: () => JSXValue): void {
  effect(() => {
    el.textContent = stringifyText(value())
  })
}

function stringifyText(value: JSXValue): string {
  if (Array.isArray(value)) return value.map(stringifyText).join('')
  if (value == null || value === false || value === true) return ''
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return value.textContent ?? ''
  }
  return String(value)
}

export function setAttr(el: Element, name: string, value: AttrValue): void {
  const attrName = normalizeAttrName(name)
  const propName = getBooleanDomPropertyName(name)

  if (propName && el instanceof HTMLElement) {
    ;(el as HTMLElement & Record<string, unknown>)[propName] = Boolean(value)

    if (value == null || value === false) {
      el.removeAttribute(attrName)
    } else if (value === true) {
      el.setAttribute(attrName, '')
    } else {
      el.setAttribute(attrName, String(value))
    }

    return
  }

  if (value == null || value === false) {
    el.removeAttribute(attrName)
    return
  }

  if (value === true) {
    el.setAttribute(attrName, '')
    return
  }

  el.setAttribute(attrName, String(value))
}

function getBooleanDomPropertyName(name: string): string | undefined {
  if (BOOLEAN_DOM_PROPERTIES.has(name)) {
    return DOM_PROPERTY_NAME[name] ?? name
  }
  return undefined
}

function normalizeAttrName(name: string): string {
  return name === 'className' ? 'class' : name
}

const BOOLEAN_DOM_PROPERTIES = new Set([
  'hidden',
  'disabled',
  'readonly',
  'multiple',
  'selected',
  'checked',
  'open',
  'autofocus',
  'indeterminate',
  'draggable',
  'spellcheck',
  'translate',
  'contentEditable',
  'noValidate',
])

const DOM_PROPERTY_NAME: Record<string, string> = {
  readonly: 'readOnly',
}

export function bindAttr(
  el: Element,
  name: string,
  value: () => AttrValue,
): void {
  effect(() => {
    setAttr(el, name, value())
  })
}

export function bindProp<T extends Element, K extends keyof T>(
  el: T,
  name: K,
  value: () => T[K],
): void {
  effect(() => {
    el[name] = value()
  })
}

export function bindClass(el: Element, value: () => ClassValue): void {
  effect(() => {
    const next = normalizeClass(value())
    if (next) {
      el.setAttribute('class', next)
    } else {
      el.removeAttribute('class')
    }
  })
}

export function normalizeClass(value: ClassValue): string {
  if (!value) return ''

  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(' ')
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .filter(key => value[key])
      .join(' ')
  }

  return ''
}

export function bindStyle(
  el: HTMLElement | SVGElement,
  value: () => StyleValue,
): void {
  let prev: Record<string, string | number | null | undefined> | undefined

  effect(() => {
    const next = value()

    if (next == null) {
      el.removeAttribute('style')
      prev = undefined
      return
    }

    if (typeof next === 'string') {
      el.setAttribute('style', next)
      prev = undefined
      return
    }

    patchStyle(
      el,
      prev,
      next as Record<string, string | number | null | undefined>,
    )
    prev = next as Record<string, string | number | null | undefined>
  })
}

function patchStyle(
  el: HTMLElement | SVGElement,
  prev: Record<string, string | number | null | undefined> | undefined,
  next: Record<string, string | number | null | undefined>,
): void {
  const style = (el as HTMLElement).style

  if (prev) {
    for (const key in prev) {
      if (!(key in next)) {
        style.setProperty(toKebabCase(key), '')
      }
    }
  }

  for (const key in next) {
    const value = next[key]
    const name = toKebabCase(key)

    if (value == null) {
      style.setProperty(name, '')
    } else {
      style.setProperty(name, normalizeStyleValue(key, value))
    }
  }
}

function normalizeStyleValue(key: string, value: string | number): string {
  if (typeof value === 'number' && value !== 0 && !isUnitlessNumber(key)) {
    return `${value}px`
  }

  return String(value)
}

const unitlessNumbers = new Set([
  'opacity',
  'zIndex',
  'fontWeight',
  'lineHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
])

function isUnitlessNumber(key: string): boolean {
  return unitlessNumbers.has(key)
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
