import * as t from '@babel/types'

import { transformNode } from './node'
import { getRendererConfig, registerImportMethod } from '../codegen/support'
import { createTemplate } from '../codegen/template'
import { isElementResult } from '../parse/jsx'
import { escapeHTML, trimJSXText } from '../utils/html'

import type {
  BabelJSXElementPath,
  BabelJSXPath,
  BabelState,
  ElementTransformResults,
} from '../types'

export function transformChildren(
  path: BabelJSXElementPath,
  state: BabelState,
  results: ElementTransformResults,
) {
  const children = filterChildren(path.get('children') as BabelJSXPath[])

  let previousElementId = results.id
  let childElementIndex = 0

  children.forEach(child => {
    const transformed = transformNode(child, state)

    if (!transformed) return

    results.template += transformed.template
    results.templateWithClosingTags +=
      transformed.templateWithClosingTags || transformed.template

    results.declarations.push(...transformed.declarations)
    results.exprs.push(...transformed.exprs)
    results.dynamics.push(...transformed.dynamics)
    results.postExprs.push(...transformed.postExprs)

    results.isSVG ||= transformed.isSVG
    results.hasCustomElement ||= transformed.hasCustomElement
    results.isImportNode ||= transformed.isImportNode
    results.hasHydratableEvent ||= transformed.hasHydratableEvent

    if (isElementResult(transformed)) {
      results.declarations.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            transformed.id,
            t.memberExpression(
              previousElementId,
              t.identifier(
                childElementIndex === 0 ? 'firstChild' : 'nextSibling',
              ),
            ),
          ),
        ]),
      )

      previousElementId = transformed.id
      childElementIndex++
      return
    }

    if (transformed.kind === 'dynamic') {
      results.exprs.push(
        t.expressionStatement(
          t.callExpression(
            registerImportMethod(
              child,
              'insert',
              getRendererConfig(child, 'dom').moduleName,
            ),
            [results.id, transformed.expr],
          ),
        ),
      )
    }
  })
}

function filterChildren(children: BabelJSXPath[]): BabelJSXPath[] {
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

//#region fragment / component children helpers

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
      nodes.push(result.expr)
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

//#endregion
