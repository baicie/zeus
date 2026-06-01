export function toPascalCase(value: string): string {
  const result = value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

  return result || 'Icon'
}

export function toIconComponentName(name: string): string {
  const pascal = toPascalCase(name)

  return pascal.endsWith('Icon') ? pascal : `${pascal}Icon`
}

export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function getIconJsFileName(name: string): string {
  return `${sanitizeFileName(name)}.js`
}

export function getIconSvgFileName(name: string): string {
  return `${sanitizeFileName(name)}.svg`
}

export function getIconDtsFileName(name: string): string {
  return `${sanitizeFileName(name)}.d.ts`
}
