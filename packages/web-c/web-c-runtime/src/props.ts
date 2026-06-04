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
  oldValue: string | null,
  newValue: string | null,
): void {
  if (hostRef.reflectingAttrs.has(attrName)) {
    return
  }

  const prop = findPropByAttrName(hostRef, attrName)

  if (!prop) {
    return
  }

  const oldPropValue = getPropValue(hostRef, prop)
  const newPropValue = parseAttributeValue(prop, newValue)

  if (!Object.is(oldPropValue, newPropValue)) {
    hostRef.values.set(prop.name, newPropValue)

    if (hostRef.loaded) {
      hostRef.instance?.propertyChanged?.(prop.name, oldPropValue, newPropValue)
    }
  }

  if (hostRef.loaded) {
    hostRef.instance?.attributeChanged?.(attrName, oldValue, newValue)
  } else {
    hostRef.queuedAttrs.push({
      name: attrName,
      oldValue,
      newValue,
    })
  }
}

export function applyInitialValues(hostRef: HostRef): void {
  const host = hostRef.host

  for (const prop of hostRef.meta.props) {
    if (hostRef.values.has(prop.name)) {
      continue
    }

    const attrName = prop.attrName ?? prop.name

    if (host.hasAttribute(attrName)) {
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

function findPropByAttrName(
  hostRef: HostRef,
  attrName: string,
): ZeusPropMeta | undefined {
  return hostRef.meta.props.find(prop => {
    return (prop.attrName ?? prop.name).toLowerCase() === attrName
  })
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
  const attrName = prop.attrName ?? prop.name

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

    if (prop.type === 'string' || prop.type === 'number') {
      host.setAttribute(attrName, String(value))
    }
  } finally {
    hostRef.reflectingAttrs.delete(attrName)
  }
}
