export interface NamingOptions {
  stripPrefix?: string | false
  fileName?: (tag: string) => string
}

export function getFileBaseName(tag: string, options: NamingOptions): string {
  if (options.fileName) {
    return sanitize(options.fileName(tag)).replace(/\.js$/, '')
  }

  let name = tag

  if (options.stripPrefix && name.startsWith(options.stripPrefix)) {
    name = name.slice(options.stripPrefix.length)
  }

  return sanitize(name)
}

export function getJsFileName(tag: string, options: NamingOptions): string {
  return `${getFileBaseName(tag, options)}.js`
}

export function sanitize(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
