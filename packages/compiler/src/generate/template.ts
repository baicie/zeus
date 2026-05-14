import * as t from '@babel/types'

import { registerTemplate, getProgramScopeData } from '../utils'

import type { BabelJSXPath, ElementTransformResults } from '../types'

export function createTemplate(
  path: BabelJSXPath,
  result: ElementTransformResults,
): t.Expression {
  registerTemplate(path, result)

  const templates = getProgramScopeData(path).templates || []
  const templateRecord = templates.find(t => t.template === result.template)

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
