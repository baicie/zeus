import type { ComponentProp, ComponentPropType } from './types'

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

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
