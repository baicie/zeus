import type { OutputWCOptions } from './types'

export function getComponentFileBaseName(
  tag: string,
  options: OutputWCOptions,
): string {
  if (options.fileName) {
    return sanitizeFileName(options.fileName(tag)).replace(/\.js$/, '')
  }

  let name = tag

  if (options.stripPrefix && name.startsWith(options.stripPrefix)) {
    name = name.slice(options.stripPrefix.length)
  }

  return sanitizeFileName(name)
}

export function getComponentFileName(
  tag: string,
  options: OutputWCOptions,
): string {
  return `${getComponentFileBaseName(tag, options)}.js`
}

export function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
