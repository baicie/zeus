import * as t from '@babel/types'

import { getObjectProperty, staticValue } from './utils'

export interface InlineMeta {
  description?: string
  props?: Record<string, unknown>
  events?: Record<string, unknown>
  slots?: Record<string, unknown>
  methods?: string[]
  cssVars?: Record<string, unknown>
  cssParts?: string[]
  [key: string]: unknown
}

export function extractInlineMeta(
  options: t.ObjectExpression | undefined,
): InlineMeta {
  if (!options) return {}

  const metaNode = getObjectProperty(options, 'meta')
  const result: InlineMeta = {}

  if (t.isObjectExpression(metaNode)) {
    const value = staticValue(metaNode)

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, value as InlineMeta)
    }
  }

  assignTopLevelStaticValue(options, result, 'slots')
  assignTopLevelStaticValue(options, result, 'parts')
  assignTopLevelStaticValue(options, result, 'cssVars')
  assignTopLevelStaticValue(options, result, 'methods')

  return result
}

function assignTopLevelStaticValue(
  options: t.ObjectExpression,
  result: InlineMeta,
  key: string,
): void {
  const node = getObjectProperty(options, key)

  if (!node) return

  const value = staticValue(node)

  if (key === 'parts') {
    result.cssParts = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : result.cssParts
    return
  }

  result[key] = value
}
