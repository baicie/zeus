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

  return dynamicTextIR(expr, ref(context.uid('text$').name))
}
