export interface FilterOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[] | string | string[]
}

export function normalizePatterns(
  value: RegExp | RegExp[] | string | string[],
): RegExp[] {
  const arr = Array.isArray(value) ? value : [value]
  return arr.map(p => (typeof p === 'string' ? new RegExp(p) : p))
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
