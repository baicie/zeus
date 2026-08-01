// packages/web-c-runtime/src/props.ts

import {
  coerceCustomElementAttribute,
  findCustomElementPropByAttribute,
  getCustomElementAttributeName,
  getCustomElementObservedAttributes,
  reflectCustomElementProperty,
} from '@zeus-js/runtime-dom'

import { requireHostRef } from './host-ref'

import type { HostRef, ZeusPropMeta } from './types'

export function installPropertyAccessors(
  proto: HTMLElement,
  props: ZeusPropMeta[],
): void {
  for (const prop of props) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, prop.name)

    if (descriptor) {
      continue
    }

    Object.defineProperty(proto, prop.name, {
      get(this: HTMLElement) {
        const hostRef = requireHostRef(this)
        return getPropValue(hostRef, prop)
      },

      set(this: HTMLElement, value: unknown) {
        const hostRef = requireHostRef(this)
        setPropValue(hostRef, prop, value)
      },

      configurable: true,
      enumerable: true,
    })
  }
}

export function getPropValue(hostRef: HostRef, prop: ZeusPropMeta): unknown {
  if (hostRef.values.has(prop.name)) {
    return hostRef.values.get(prop.name)
  }

  return prop.default
}

export function setPropValue(
  hostRef: HostRef,
  prop: ZeusPropMeta,
  value: unknown,
): void {
  const oldValue = getPropValue(hostRef, prop)

  if (Object.is(oldValue, value)) {
    return
  }

  hostRef.values.set(prop.name, value)
  hostRef.attributeProps.delete(prop.name)

  if (prop.reflect) {
    reflectCustomElementProperty(
      hostRef.host,
      prop,
      value,
      hostRef.reflectingAttrs,
    )
  }

  if (hostRef.loaded) {
    hostRef.instance?.propertyChanged?.(prop.name, oldValue, value)
  }
}

export function syncAttributeToProperty(
  hostRef: HostRef,
  attrName: string,
  _oldValue: string | null,
  newValue: string | null,
): void {
  const normalizedAttrName = normalizeAttrName(attrName)

  if (hostRef.reflectingAttrs.has(normalizedAttrName)) {
    return
  }

  const prop = findCustomElementPropByAttribute(
    hostRef.meta.props,
    normalizedAttrName,
  ) as ZeusPropMeta | undefined

  if (!prop) {
    return
  }

  const oldPropValue = getPropValue(hostRef, prop)
  const newPropValue = coerceCustomElementAttribute(prop, newValue)

  if (Object.is(oldPropValue, newPropValue)) {
    return
  }

  hostRef.values.set(prop.name, newPropValue)
  hostRef.attributeProps.add(prop.name)

  if (hostRef.loaded) {
    hostRef.instance?.propertyChanged?.(prop.name, oldPropValue, newPropValue)
  }
}

export function applyInitialValues(hostRef: HostRef): void {
  const host = hostRef.host

  for (const prop of hostRef.meta.props) {
    if (hostRef.values.has(prop.name)) {
      continue
    }

    const attrName = getCustomElementAttributeName(prop)

    if (attrName && host.hasAttribute(attrName)) {
      hostRef.values.set(
        prop.name,
        coerceCustomElementAttribute(prop, host.getAttribute(attrName)),
      )
      hostRef.attributeProps.add(prop.name)
      continue
    }

    if ('default' in prop) {
      hostRef.values.set(prop.name, prop.default)
    }
  }
}

export function getObservedAttributes(props: ZeusPropMeta[]): string[] {
  return getCustomElementObservedAttributes(props)
}

/**
 * Upgrades properties that were written on an element instance before its
 * custom element class was defined (e.g. during SSR or before
 * `defineCustomElements()` was called). Own properties on the element
 * shadow the prototype accessors, so we must capture them before
 * the prototype accessors take effect.
 */
export function upgradePreDefinedProperties(
  host: HTMLElement,
  hostRef: HostRef,
): void {
  const target = host as HTMLElement & Record<string, unknown>

  for (const prop of hostRef.meta.props) {
    if (!Object.prototype.hasOwnProperty.call(target, prop.name)) {
      continue
    }

    const descriptor = Object.getOwnPropertyDescriptor(target, prop.name)

    if (descriptor?.configurable === false) {
      continue
    }

    const value = target[prop.name]

    delete target[prop.name]

    setPropValue(hostRef, prop, value)
  }
}

function normalizeAttrName(value: string): string {
  return value.toLowerCase()
}
