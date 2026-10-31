import type { ComponentEvent, ComponentProp, ComponentPropType } from './types'

/**
 * Whether the prop type converts to and from an attribute without a codec.
 */
export function isAttributeBackedPropType(type: ComponentPropType): boolean {
  return type === 'string' || type === 'number' || type === 'boolean'
}

/**
 * The attribute a custom element observes for a prop, or `false` for a
 * property-only prop. Structured props are attribute-backed only with a
 * declared deserializer, and names are lowercase because HTML attribute names
 * are case-insensitive. Every output must use this so that it matches
 * `getCustomElementAttributeName` in `@zeus-js/runtime-dom`.
 */
export function getComponentAttributeName(
  propName: string,
  prop: ComponentProp,
): string | false {
  if (prop.attr === false) return false
  if (!isAttributeBackedPropType(prop.type) && !prop.deserialize) return false
  return (prop.attr ?? toKebabCase(propName)).toLowerCase()
}

/**
 * The DOM event name a component dispatches for an `emits` entry: the
 * declared name, or the kebab-case form of its key. Matches the `emit` API of
 * `defineElement` in `@zeus-js/runtime-dom`.
 */
export function getComponentEventName(
  key: string,
  event: ComponentEvent,
): string {
  return event.name ?? toKebabCase(event.key ?? key)
}

/** RFC-010 requires unique kebab-case DOM event names. */
export function isValidComponentEventName(name: string): boolean {
  return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
