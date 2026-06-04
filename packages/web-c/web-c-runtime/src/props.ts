// packages/web-c-runtime/src/props.ts

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

  if (prop.reflect) {
    reflectPropertyToAttribute(hostRef, prop, value)
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

  const prop = findPropByAttrName(hostRef, normalizedAttrName)

  if (!prop) {
    return
  }

  const oldPropValue = getPropValue(hostRef, prop)
  const newPropValue = parseAttributeValue(prop, newValue)

  if (Object.is(oldPropValue, newPropValue)) {
    return
  }

  hostRef.values.set(prop.name, newPropValue)

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

    const attrName = getAttrName(prop)

    if (attrName && host.hasAttribute(attrName)) {
      hostRef.values.set(
        prop.name,
        parseAttributeValue(prop, host.getAttribute(attrName)),
      )
      continue
    }

    if ('default' in prop) {
      hostRef.values.set(prop.name, prop.default)
    }
  }
}

export function replayQueuedAttributes(hostRef: HostRef): void {
  const queuedAttrs = hostRef.queuedAttrs
  hostRef.queuedAttrs = []

  for (const attr of queuedAttrs) {
    hostRef.instance?.attributeChanged?.(
      attr.name,
      attr.oldValue,
      attr.newValue,
    )
  }
}

export function getObservedAttributes(props: ZeusPropMeta[]): string[] {
  const attrs: string[] = []

  for (const prop of props) {
    const attrName = getAttrName(prop)

    if (attrName) {
      attrs.push(attrName)
    }
  }

  return attrs
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

function findPropByAttrName(
  hostRef: HostRef,
  attrName: string,
): ZeusPropMeta | undefined {
  return hostRef.meta.props.find(prop => {
    return getAttrName(prop) === attrName
  })
}

function getAttrName(prop: ZeusPropMeta): string | undefined {
  if (prop.attrName === false) {
    return undefined
  }

  return normalizeAttrName(prop.attrName ?? toKebabCase(prop.name))
}

function normalizeAttrName(value: string): string {
  return value.toLowerCase()
}

function parseAttributeValue(
  prop: ZeusPropMeta,
  value: string | null,
): unknown {
  switch (prop.type) {
    case 'boolean':
      return value !== null

    case 'number':
      if (value === null || value === '') {
        return undefined
      }

      return Number(value)

    case 'string':
      return value ?? undefined

    case 'object':
    case 'array':
      if (value === null) {
        return undefined
      }

      try {
        return JSON.parse(value)
      } catch {
        return prop.type === 'array' ? [] : {}
      }

    default:
      return value
  }
}

function reflectPropertyToAttribute(
  hostRef: HostRef,
  prop: ZeusPropMeta,
  value: unknown,
): void {
  const host = hostRef.host
  const attrName = getAttrName(prop)

  if (!attrName) {
    return
  }

  hostRef.reflectingAttrs.add(attrName)

  try {
    if (prop.type === 'boolean') {
      host.toggleAttribute(attrName, Boolean(value))
      return
    }

    if (value === null || value === undefined || value === false) {
      host.removeAttribute(attrName)
      return
    }

    if (prop.type === 'object' || prop.type === 'array') {
      host.setAttribute(attrName, JSON.stringify(value))
      return
    }

    if (prop.type === 'string' || prop.type === 'number') {
      host.setAttribute(attrName, String(value))
    }
  } finally {
    hostRef.reflectingAttrs.delete(attrName)
  }
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
