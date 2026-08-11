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
    requireSourceSpanFromBabelNode(path.node),
    expressionFormFromBabelNode(path.node),
  )
}

export function expressionIRFromCode(code: string, node: t.Node): ExpressionIR {
  return expressionIR(
    code,
    requireSourceSpanFromBabelNode(node),
    expressionFormFromBabelNode(
      parseExpression(code, {
        sourceType: 'module',
        plugins: ['typescript', 'jsx'],
      }),
    ),
  )
}

export function parseExpressionIR(expression: ExpressionIR): t.Expression {
  const start = expression.span.start

  return parseExpression(expression.code, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    startLine: start.line,
    startColumn: start.column,
    startIndex: start.offset,
  })
}

export function sourceSpanFromBabelNode(
  node: t.Node | null | undefined,
): SourceSpan | undefined {
  if (
    !node?.loc ||
    typeof node.start !== 'number' ||
    typeof node.end !== 'number'
  ) {
    return undefined
  }

  return {
    start: sourcePosition(
      node.loc.start.line,
      node.loc.start.column,
      node.start,
    ),
    end: sourcePosition(node.loc.end.line, node.loc.end.column, node.end),
  }
}

function requireSourceSpanFromBabelNode(node: t.Node): SourceSpan {
  const span = sourceSpanFromBabelNode(node)
  if (!span) {
    throw new Error(`Babel node ${node.type} is missing source offsets.`)
  }
  return span
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
  offset: number,
): SourcePosition {
  return { line, column, offset }
}
