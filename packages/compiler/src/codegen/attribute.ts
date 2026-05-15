/**
 * Attribute codegen helpers.
 *
 * Low-level Babel AST node builders for attribute and event binding.
 * These produce Babel AST nodes — they belong in the codegen layer, not utils.
 */
import * as t from '@babel/types'

import { getRendererConfig, registerImportMethod } from './support'
import { escapeHTML } from '../utils/html'

import type { ElementTransformResults } from '../types'
import type { NodePath } from '@babel/core'

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
  path: NodePath,
  elem: t.Identifier,
  key: string,
  value: t.Expression,
): t.CallExpression {
  return t.callExpression(
    registerImportMethod(
      path,
      'setAttr',
      getRendererConfig(path, 'dom').moduleName,
    ),
    [elem, t.stringLiteral(key), value],
  )
}
