import path from 'node:path'

import picomatch from 'picomatch'

import { cleanUrl } from './filter'

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function createComponentTransformFilter(options: {
  root: string
  include: string[]
  exclude: string[]
}) {
  const isIncluded = picomatch(options.include)
  const isExcluded = picomatch(options.exclude)

  return function shouldTransform(id: string): boolean {
    const clean = normalizePath(cleanUrl(id))
    const relative = normalizePath(path.relative(options.root, clean))

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return false
    }

    if (isExcluded(relative)) return false

    return isIncluded(relative)
  }
}
