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
        return getPropValue(hostRef, findProp(hostRef, prop.name))
      },

      set(this: HTMLElement, value: unknown) {
        const hostRef = requireHostRef(this)
        setPropValue(hostRef, findProp(hostRef, prop.name), value)
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

  hostRef.values.set(prop.name, value)
  hostRef.attributeProps.delete(prop.name)
  hostRef.pendingAttributes.delete(prop.name)

  if (prop.reflect) {
    reflectCustomElementProperty(
      hostRef.host,
      prop,
      value,
      hostRef.reflectingAttrs,
    )
  }

  if (hostRef.loaded && !Object.is(oldValue, value)) {
    hostRef.instance?.propertyChanged?.({
      name: prop.name,
      value,
      source: 'property',
    })
  }
}

export function syncAttributeToProperty(
  hostRef: HostRef,
  attrName: string,
  oldValue: string | null,
  newValue: string | null,
): void {
  const normalizedAttrName = normalizeAttrName(attrName)

  if (hostRef.reflectingAttrs.has(normalizedAttrName)) {
    return
  }

  const initialValue = hostRef.preUpgradeAttributes.get(normalizedAttrName)
  hostRef.preUpgradeAttributes.delete(normalizedAttrName)
  if (oldValue === null && newValue === initialValue) return

  const prop = findCustomElementPropByAttribute(
    hostRef.propDefinitions,
    normalizedAttrName,
  ) as ZeusPropMeta | undefined

  if (!prop) {
    return
  }

  hostRef.attributeProps.add(prop.name)
  if (prop.deserialize === true) {
    hostRef.pendingAttributes.set(prop.name, newValue)
    return
  }

  const oldPropValue = getPropValue(hostRef, prop)
  const newPropValue = coerceCustomElementAttribute(prop, newValue)

  hostRef.values.set(prop.name, newPropValue)

  if (hostRef.loaded && !Object.is(oldPropValue, newPropValue)) {
    hostRef.instance?.propertyChanged?.({
      name: prop.name,
      value: newPropValue,
      source: 'attribute',
      rawAttributeValue: newValue,
    })
  }
}

export function applyInitialValues(hostRef: HostRef): void {
  const host = hostRef.host

  for (const prop of hostRef.propDefinitions) {
    if (hostRef.values.has(prop.name)) {
      continue
    }

    const attrName = getCustomElementAttributeName(prop)

    if (attrName && host.hasAttribute(attrName)) {
      if (prop.deserialize === true) {
        hostRef.pendingAttributes.set(prop.name, host.getAttribute(attrName))
        hostRef.attributeProps.add(prop.name)
        continue
      }
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

/** Replace deferred codec markers with the implementation's real schema. */
export function resolveHostProperties(
  hostRef: HostRef,
  definitions: ZeusPropMeta[],
): void {
  for (const previous of hostRef.propDefinitions) {
    if (!hostRef.pendingAttributes.has(previous.name)) continue
    const definition = definitions.find(prop => prop.name === previous.name)
    const attrName = definition && getCustomElementAttributeName(definition)
    if (definition && attrName) {
      hostRef.values.set(
        previous.name,
        coerceCustomElementAttribute(
          definition,
          hostRef.pendingAttributes.get(previous.name)!,
        ),
      )
    }
  }
  hostRef.propDefinitions = definitions
  hostRef.pendingAttributes.clear()
}

function findProp(hostRef: HostRef, name: string): ZeusPropMeta {
  return hostRef.propDefinitions.find(prop => prop.name === name)!
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

    const attrName = getCustomElementAttributeName(prop)
    const attrValue = attrName ? host.getAttribute(attrName) : null
    if (attrName && attrValue !== null)
      hostRef.preUpgradeAttributes.set(attrName, attrValue)

    delete target[prop.name]

    setPropValue(hostRef, prop, value)
  }
}

function normalizeAttrName(value: string): string {
  return value.toLowerCase()
}
