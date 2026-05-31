import path from 'node:path'

export function toAbsoluteImportPath(root: string, source: string): string {
  const absolute = path.resolve(root, source)
  return normalizePath(absolute)
}

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}
