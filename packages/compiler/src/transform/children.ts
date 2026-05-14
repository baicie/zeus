import * as t from '@babel/types'

import { transformNode } from './node'
import { getRendererConfig, registerImportMethod } from '../runtime'
import { isElementResult } from '../utils'

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
