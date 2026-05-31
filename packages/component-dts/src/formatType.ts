import type { ComponentEvent, ComponentProp } from '@zeus-js/component-analyzer'

export function formatPropType(prop: ComponentProp): string {
  if (prop.values?.length) {
    return prop.values.map(value => JSON.stringify(value)).join(' | ')
  }

  switch (prop.type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'unknown[]'
    case 'object':
      return 'Record<string, unknown>'
    default:
      return 'unknown'
  }
}

export function formatEventType(event: ComponentEvent): string {
  if (!event.detail) {
    return 'CustomEvent<unknown>'
  }
  return `CustomEvent<${formatDetailType(event.detail)}>`
}

export function formatDetailType(detail: Record<string, string>): string {
  const fields = Object.entries(detail)
    .map(
      ([name, type]) =>
        `${safePropertyName(name)}: ${normalizeKnownType(type)}`,
    )
    .join('; ')
  return `{ ${fields} }`
}

export function normalizeKnownType(type: string): string {
  switch (type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'unknown':
    case 'MouseEvent':
    case 'KeyboardEvent':
    case 'PointerEvent':
    case 'FocusEvent':
    case 'InputEvent':
    case 'Event':
      return type
    case 'object':
      return 'Record<string, unknown>'
    case 'array':
      return 'unknown[]'
    default:
      return type || 'unknown'
  }
}

export function safePropertyName(name: string): string {
  if (/^[A-Za-z\_$][A-Za-z0-9_$]*$/.test(name)) {
    return name
  }
  return JSON.stringify(name)
}

export function isRequiredProp(prop: ComponentProp): boolean {
  if (prop.default !== undefined) return false
  return prop.required === true
}
