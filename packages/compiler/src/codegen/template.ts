/**
 * Template AST generation.
 *
 * Converts an ElementTransformResults (the element IR) into a Babel AST expression.
 *
 * The key job is injecting the element ID declaration:
 *   const _el$ = _tmpl$().firstChild
 *
 * For static elements (no bindings/expressions, single declaration), the result is:
 *   _tmpl$().firstChild
 *
 * For elements with bindings, the result is wrapped in an arrow function:
 *   () => {
 *     const _el$ = _tmpl$().firstChild
 *     $setAttr(_el$, 'id', id)
 *     return _el$
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

  const elementIdDecl = t.variableDeclaration('const', [
    t.variableDeclarator(
      t.cloneNode(result.id),
      t.memberExpression(templateCall, t.identifier('firstChild')),
    ),
  ])

  const hasDynamics =
    result.exprs.length ||
    result.dynamics.length ||
    result.postExprs.length ||
    result.declarations.length > 0

  if (!hasDynamics) {
    return t.memberExpression(templateCall, t.identifier('firstChild'))
  }

  return t.callExpression(
    t.arrowFunctionExpression(
      [],
      t.blockStatement([
        elementIdDecl,
        ...result.declarations,
        ...result.exprs,
        ...result.dynamics,
        ...result.postExprs,
        t.returnStatement(t.cloneNode(result.id)),
      ]),
    ),
    [],
  )
}
