// Naming utilities for the compiler

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export function camelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? capitalize(c) : ''))
    .replace(/^(.)/, (_, c) => c.toLowerCase())
}

export function kebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/^-/, '')
}

export function pascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(capitalize)
    .join('')
}

export function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str)
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function normalizeEventName(name: string): string {
  if (name.startsWith('on')) {
    return name.slice(2).toLowerCase()
  }
  return name.toLowerCase()
}

export function denormalizeEventName(name: string): string {
  return `on${capitalize(name)}`
}
