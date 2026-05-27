import * as t from '@babel/types'

import { dynamicTextIR, ref } from '../ir/semanticBuilders'

import type { CompilerContext } from '../context'
import type { DynamicTextIR } from '../ir/nodes'
import type { NodePath } from '@babel/core'

export function lowerExpression(
  path: NodePath<t.JSXExpressionContainer>,
  context: CompilerContext,
): DynamicTextIR | null {
  const expr = path.node.expression

  if (t.isJSXEmptyExpression(expr)) return null
  if (!t.isExpression(expr)) return null

  return dynamicTextIR(
    expr,
    ref(context.uid('anchor$').name),
    hasOnceMarker(expr),
  )
}

function hasOnceMarker(expr: t.Expression): boolean {
  const comments = [
    ...(expr.leadingComments ?? []),
    ...(expr.trailingComments ?? []),
    ...(expr.innerComments ?? []),
  ]

  return comments.some(comment => comment.value.includes('@once'))
}
