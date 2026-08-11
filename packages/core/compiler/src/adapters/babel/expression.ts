import { parseExpression } from '@babel/parser'
import * as t from '@babel/types'
import { expressionIR } from '@zeus-js/compiler-shared'

import type { NodePath } from '@babel/core'
import type {
  ExpressionForm,
  ExpressionIR,
  SourcePosition,
  SourceSpan,
} from '@zeus-js/compiler-shared'

export function lowerExpressionIR(path: NodePath<t.Expression>): ExpressionIR {
  const source = path.getSource()

  return expressionIR(
    source || path.toString(),
    sourceSpanFromBabelNode(path.node),
    expressionFormFromBabelNode(path.node),
  )
}

export function expressionIRFromCode(
  code: string,
  node?: t.Node | null,
): ExpressionIR {
  return expressionIR(
    code,
    sourceSpanFromBabelNode(node),
    expressionFormFromBabelNode(node),
  )
}

export function parseExpressionIR(expression: ExpressionIR): t.Expression {
  const start = expression.span?.start
  const sourceStart =
    typeof start?.offset === 'number'
      ? {
          startLine: start.line,
          startColumn: start.column,
          startIndex: start.offset,
        }
      : {}

  return parseExpression(expression.code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    ...sourceStart,
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

export function expressionFormFromBabelNode(
  node: t.Node | null | undefined,
): ExpressionForm {
  if (!node) return 'value'

  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    return 'getter'
  }
  if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
    return 'member'
  }
  if (
    t.isParenthesizedExpression(node) ||
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSNonNullExpression(node) ||
    t.isTSInstantiationExpression(node) ||
    t.isTypeCastExpression(node)
  ) {
    return expressionFormFromBabelNode(node.expression)
  }

  return 'value'
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
