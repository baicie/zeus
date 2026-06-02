import path from 'node:path'

export function toAbsoluteImportPath(root: string, source: string): string {
  const normalizedRoot = normalizePath(root)
  const normalizedSource = normalizePath(source)
  if (normalizedRoot.startsWith('/')) {
    return `${normalizedRoot.replace(/\/$/, '')}/${normalizedSource.replace(/^\//, '')}`
  }
  const absolute = path.resolve(normalizedRoot, normalizedSource)
  return normalizePath(absolute)
}

export function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}
