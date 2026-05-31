export interface FilterOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
}

export function normalizePatterns(value: RegExp | RegExp[]): RegExp[] {
  return Array.isArray(value) ? value : [value]
}

export function createFilter(options: FilterOptions = {}) {
  const include = normalizePatterns(options.include ?? /\.[tj]sx(?:\?.*)?$/)
  const exclude = normalizePatterns(options.exclude ?? /node_modules/)

  return function shouldTransform(id: string): boolean {
    const cleanId = cleanUrl(id)

    if (exclude.some(pattern => pattern.test(cleanId))) {
      return false
    }

    return include.some(pattern => pattern.test(cleanId))
  }
}

export function cleanUrl(id: string): string {
  return id.replace(/[?#].*$/, '')
}
