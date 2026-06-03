// packages/runtime-dom/src/webComponents.ts

import { bindAttr, bindClass, bindStyle } from './bindings'
import { getCurrentHostContext } from './hostContext'
import { bindRef } from './refs'
import { createSlot } from './slot'

import type {
  AttrValue,
  ClassValue,
  JSXValue,
  RefTarget,
  StyleValue,
} from './types'

type HostValue<T> = T | (() => T)

export interface HostProps extends Record<string, unknown> {
  children?: JSXValue | (() => JSXValue)

  /**
   * Ref to current custom element host.
   */
  ref?: RefTarget<HTMLElement>

  /**
   * class and className both map to host class attribute.
   */
  class?: HostValue<ClassValue>
  className?: HostValue<ClassValue>

  /**
   * Inline style for host element.
   */
  style?: HostValue<StyleValue>

  /**
   * Common host attributes.
   */
  id?: HostValue<AttrValue>
  role?: HostValue<AttrValue>
  part?: HostValue<AttrValue>
  title?: HostValue<AttrValue>
  slot?: HostValue<AttrValue>
  tabIndex?: HostValue<number | null | undefined | false>

  /**
   * data-* / aria-* are accepted through index signature.
   */

  /**
   * @internal Compiler-generated element refs for Host-level attribute binding.
   */
  _elements?: Record<string, () => Element | null>
}

export interface SlotProps {
  name?: string
  children?: JSXValue | (() => JSXValue)
}

const HOST_RESERVED_KEYS = new Set([
  'children',
  'ref',
  'class',
  'className',
  'style',
  '_elements',
])

export function Host(props: HostProps): JSXValue {
  const context = getCurrentHostContext()

  if (context) {
    bindHostProps(context.host, props)
  }

  return resolveValue(props.children)
}

export function Slot(props: SlotProps): JSXValue {
  return createSlot(props.name, () => resolveValue(props.children))
}

function bindHostProps(host: HTMLElement, props: HostProps): void {
  bindHostRef(host, props)
  bindHostClass(host, props)
  bindHostStyle(host, props)
  bindHostAttributes(host, props)

  if ('_elements' in props) {
    bindHostElementBindings(host, props)
  }
}

function bindHostRef(host: HTMLElement, props: HostProps): void {
  if (!('ref' in props)) return

  bindRef(host, props.ref)
}

function bindHostClass(host: HTMLElement, props: HostProps): void {
  if (!('class' in props) && !('className' in props)) return

  const value = props.className !== undefined ? props.className : props.class

  bindClass(host, () => {
    return resolveHostValue(value) as ClassValue
  })
}

function bindHostStyle(host: HTMLElement, props: HostProps): void {
  if (!('style' in props)) return

  bindStyle(host, () => {
    return resolveHostValue(props.style) as StyleValue
  })
}

function bindHostAttributes(host: HTMLElement, props: HostProps): void {
  for (const key of Object.keys(props)) {
    if (HOST_RESERVED_KEYS.has(key)) continue
    if (isEventLikeProp(key)) continue

    const value = props[key]
    const attrName = normalizeHostAttrName(key)

    bindAttr(host, attrName, () => {
      return resolveHostValue(value) as AttrValue
    })
  }
}

function bindHostElementBindings(host: HTMLElement, props: HostProps): void {
  const elements = props._elements as Record<string, () => Element | null>

  for (const _key of Object.keys(elements)) {
    const getEl = elements[_key]
    const el = getEl()
    if (!el) continue

    for (const attrKey of Object.keys(props)) {
      if (HOST_RESERVED_KEYS.has(attrKey)) continue
      if (isEventLikeProp(attrKey)) continue

      const value = props[attrKey]
      const attrName = normalizeHostAttrName(attrKey)

      bindAttr(el, attrName, () => {
        return resolveHostValue(value) as AttrValue
      })
    }
  }
}

function resolveHostValue(value: unknown): unknown {
  if (typeof value === 'function') {
    return value()
  }
  return value
}

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : value
}

function isEventLikeProp(key: string): boolean {
  /**
   * Host Phase 1 does not bind event listeners.
   * Keep event handling inside component template + emit().
   */
  return /^on[A-Z]/.test(key) || key.startsWith('on:')
}

function normalizeHostAttrName(name: string): string {
  switch (name) {
    case 'className':
      return 'class'
    case 'htmlFor':
      return 'for'
    case 'tabIndex':
      return 'tabindex'
    case 'readOnly':
      return 'readonly'
    default:
      return name
  }
}
