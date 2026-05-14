/**
 * Template AST generation.
 *
 * Converts an ElementTransformResults (the element IR) into a Babel AST expression.
 *
 * If the element has no dynamic parts (no bindings, no expressions, a single
 * declaration), the result is a plain `tmpl$0()` call.
 * Otherwise, it wraps everything in an arrow function:
 *
 *   () => {
 *     const el$0 = tmpl$0().firstChild
 *     $setAttr(el$0, 'id', id)
 *     return el$0
 *   }
 */
import * as t from '@babel/types'

import { registerTemplate, findTemplateByString } from '../runtime'

import type { BabelJSXPath, ElementTransformResults } from '../types'

export function createTemplate(
  path: BabelJSXPath,
  result: ElementTransformResults,
): t.Expression {
  registerTemplate(path, result)

  const templateRecord = findTemplateByString(path, result.template)

  if (!templateRecord) {
    throw new Error('Template not registered')
  }

  const templateCall = t.callExpression(t.cloneNode(templateRecord.id), [])

  if (
    !result.exprs.length &&
    !result.dynamics.length &&
    !result.postExprs.length &&
    result.declarations.length === 1
  ) {
    return templateCall
  }

  return t.callExpression(
    t.arrowFunctionExpression(
      [],
      t.blockStatement([
        ...result.declarations,
        ...result.exprs,
        ...result.dynamics,
        ...result.postExprs,
        t.returnStatement(templateCall),
      ]),
    ),
    [],
  )
}
