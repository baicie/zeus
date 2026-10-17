import {
  mergeProps as mergeSourceProps,
  normalizeDOMProps,
  resolveDOMProps,
} from '@zeus-js/shared'

import { ssrAttr, ssrProp } from './element'
import { createSSRAttributeRemoval } from './property'

import type {
  SSRAttributeEntry,
  SSRAttributeValue,
  SSRClassValue,
  SSRStyleValue,
} from './types'
import type { PropsSource } from '@zeus-js/shared'

export function mergeProps<T extends object = Record<string, unknown>>(
  sources: readonly PropsSource[],
): T {
  return mergeSourceProps<T>(
    sources.map(source => {
      const value = source()
      return () => value
    }),
  )
}

export function ssrSpread(
  sources: readonly PropsSource[],
): SSRAttributeEntry[] {
  const props = resolveDOMProps(
    sources.map(source => normalizeDOMProps(source())),
  )
  const entries: SSRAttributeEntry[] = []
  for (const [key, value] of props) {
    if (key === 'ref' || (/^on/i.test(key) && key.length > 2)) continue
    const name = key.startsWith('prop:') ? key.slice(5) : key
    if (['innerHTML', 'outerHTML', 'textContent', 'children'].includes(name)) {
      throw new TypeError(
        `Zeus JSX spread cannot write structural DOM property "${key}".`,
      )
    }
    if (key.startsWith('prop:'))
      entries.push(
        ssrProp(name, value) || createSSRAttributeRemoval(name, true),
      )
    else {
      if (typeof value === 'function')
        throw new TypeError(
          `JSX attribute "${key}" cannot contain a function; use prop:${key} for function values.`,
        )
      entries.push(
        ssrAttr(
          key,
          value as SSRAttributeValue | SSRClassValue | SSRStyleValue,
        ) || createSSRAttributeRemoval(key),
      )
    }
  }
  return entries
}
