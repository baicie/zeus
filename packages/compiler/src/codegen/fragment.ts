/**
 * Fragment codegen helpers.
 *
 * Shared logic for collecting JSX children into an array of Babel expressions.
 * Used by both fragment and component transforms to avoid duplication.
 */
import * as t from '@babel/types'

import { createTemplate } from './template'
import { transformNode } from '../transform/node'
import { escapeHTML, trimJSXText } from '../utils'

import type {
  BabelJSXPath,
  BabelState,
  DynamicTransformResults,
} from '../types'

/**
 * Collects JSX children into an array of Babel expressions, applying the same
 * filtering and transformation logic that fragment and component transforms share.
 *
 * - JSXText → stringLiteral (trimmed + HTML-escaped)
 * - element result → createTemplate(...)
 * - dynamic result → result.expr
 * - text result → stringLiteral(result.template)
 *
 * Returns null if no children survived filtering.
 */
export function collectChildren(
  children: BabelJSXPath[],
  state: BabelState,
  fragmentPath?: BabelJSXPath,
): { nodes: t.Expression[]; filtered: BabelJSXPath[] } {
  const filtered = filterFragmentChildren(children)
  const nodes: t.Expression[] = []

  for (const child of filtered) {
    if (child.isJSXText()) {
      const text = trimJSXText(child.node.value)

      if (text.length) {
        nodes.push(t.stringLiteral(escapeHTML(text)))
      }

      continue
    }

    const result = transformNode(child, state)

    if (!result) continue

    if (result.kind === 'element') {
      nodes.push(createTemplate(fragmentPath ?? child, result))
      continue
    }

    if (result.kind === 'dynamic') {
      nodes.push((result as DynamicTransformResults).expr)
      continue
    }

    if (result.kind === 'text') {
      nodes.push(t.stringLiteral(result.template))
    }
  }

  return { nodes, filtered }
}

/**
 * Converts an array of Babel expressions into a single expression.
 * - 0 nodes → null
 * - 1 node  → that node (no array wrapper)
 * - 2+ nodes → arrayExpression([...nodes])
 */
export function buildChildrenExpr(nodes: t.Expression[]): t.Expression | null {
  if (!nodes.length) return null
  if (nodes.length === 1) return nodes[0]
  return t.arrayExpression(nodes)
}

function filterFragmentChildren(children: BabelJSXPath[]): BabelJSXPath[] {
  return children.filter(child => {
    if (child.isJSXText()) {
      return child.node.value.trim() !== ''
    }

    if (child.isJSXExpressionContainer()) {
      return !t.isJSXEmptyExpression(child.node.expression)
    }

    return true
  })
}
