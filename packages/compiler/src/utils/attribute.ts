import * as t from '@babel/types'

import { escapeHTML } from './html'

import type { ElementTransformResults } from '../types'

export function inlineAttributeOnTemplate(
  key: string,
  value: t.JSXAttribute['value'],
  results: ElementTransformResults,
) {
  if (!value) {
    results.template += ` ${key}`
    return
  }

  if (t.isStringLiteral(value)) {
    results.template += ` ${key}="${escapeHTML(value.value, true)}"`
    return
  }

  if (
    t.isJSXExpressionContainer(value) &&
    t.isNumericLiteral(value.expression)
  ) {
    results.template += ` ${key}="${value.expression.value}"`
  }
}

export function setAttr(
  elem: t.Identifier,
  key: string,
  value: t.Expression,
): t.CallExpression {
  return t.callExpression(t.identifier('setAttr'), [
    elem,
    t.stringLiteral(key),
    value,
  ])
}
