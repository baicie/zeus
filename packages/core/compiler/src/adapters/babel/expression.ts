import { parseExpression } from '@babel/parser'
import { expressionIR } from '@zeus-js/compiler-shared'

import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type {
  ExpressionIR,
  SourcePosition,
  SourceSpan,
} from '@zeus-js/compiler-shared'

export function lowerExpressionIR(path: NodePath<t.Expression>): ExpressionIR {
  return expressionIR(path.toString(), sourceSpanFromBabelNode(path.node))
}

export function expressionIRFromCode(
  code: string,
  node?: t.Node | null,
): ExpressionIR {
  return expressionIR(code, sourceSpanFromBabelNode(node))
}

export function parseExpressionIR(expression: ExpressionIR): t.Expression {
  return parseExpression(expression.code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  })
}

export function sourceSpanFromBabelNode(
  node: t.Node | null | undefined,
): SourceSpan | undefined {
  if (!node?.loc) return undefined

  return {
    start: sourcePosition(
      node.loc.start.line,
      node.loc.start.column,
      node.start,
    ),
    end: sourcePosition(node.loc.end.line, node.loc.end.column, node.end),
  }
}

function sourcePosition(
  line: number,
  column: number,
  offset: number | null | undefined,
): SourcePosition {
  return typeof offset === 'number'
    ? { line, column, offset }
    : { line, column }
}
