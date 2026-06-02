import * as t from '@babel/types'

import { getObjectProperty, staticValue } from './utils'

export interface InlineMeta {
  description?: string
  props?: Record<string, unknown>
  events?: Record<string, unknown>
  slots?: Record<string, unknown>
  cssVars?: string[]
  cssParts?: string[]
  [key: string]: unknown
}

export function extractInlineMeta(
  options: t.ObjectExpression | undefined,
): InlineMeta {
  if (!options) return {}

  const metaNode = getObjectProperty(options, 'meta')

  if (!t.isObjectExpression(metaNode)) return {}

  const value = staticValue(metaNode)

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as InlineMeta
}
