import * as t from '@babel/types'

import type { ElementTransformResults } from '../types'

export function createTemplate(result: ElementTransformResults): t.Expression {
  const template = result.templateWithClosingTags || result.template

  const templateCall = t.callExpression(t.identifier('template'), [
    t.stringLiteral(template),
  ])

  if (
    !result.exprs.length &&
    !result.dynamics.length &&
    !result.postExprs.length
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
        t.returnStatement(result.id),
      ]),
    ),
    [],
  )
}
