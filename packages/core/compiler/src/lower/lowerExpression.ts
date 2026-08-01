import { dynamicTextIR, ref } from '@zeus-js/compiler-shared'

import { lowerExpressionIR } from '../adapters/babel/expression'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { DynamicTextIR } from '@zeus-js/compiler-shared'

export function lowerExpression(
  path: NodePath<t.JSXExpressionContainer>,
  context: CompilerContext,
): DynamicTextIR | null {
  const expression = path.get('expression')

  if (expression.isJSXEmptyExpression()) return null
  if (!expression.isExpression()) return null

  return dynamicTextIR(
    lowerExpressionIR(expression),
    ref(context.uid('anchor$').name),
    hasOnceMarker(expression.node),
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
