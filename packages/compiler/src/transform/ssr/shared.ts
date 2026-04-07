import type * as t from '@babel/types'
import {
  arrowFunctionExpression,
  binaryExpression,
  blockStatement,
  callExpression,
  identifier,
  nullLiteral,
  returnStatement,
  stringLiteral,
} from '@babel/types'
import type { TransformResult } from '../../shared/types'

export function appendConcat(
  out: t.Expression,
  next: t.Expression,
): t.Expression {
  return binaryExpression('+', out, next)
}

export function stringifyExpression(expr: t.Expression): t.Expression {
  return callExpression(identifier('String'), [expr])
}

export function normalizeJSXTextValue(raw: string): string {
  return raw.replace(/\u200c|\u200b/g, '').trim()
}

export function resultToExpression(
  result: TransformResult,
  missingIdFallback: 'template' | 'null' = 'template',
): t.Expression {
  if (result.outputExpr) {
    return result.outputExpr
  }
  if (!result.id) {
    if (missingIdFallback === 'null') {
      return nullLiteral()
    }
    return stringLiteral(result.template || '')
  }
  const body: t.Statement[] = []
  for (let i = 0; i < result.exprs.length; i++) {
    body.push(result.exprs[i])
  }
  body.push(returnStatement(result.id))
  return callExpression(arrowFunctionExpression([], blockStatement(body)), [])
}
