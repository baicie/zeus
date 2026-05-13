import * as t from '@babel/types'

import { transformNode } from './transformNode'
import { isElementResult } from '../utils/helpers'

import type {
  BabelJSXElementPath,
  BabelJSXPath,
  BabelState,
  ElementTransformResults,
} from '../utils'

export function transformChildren(
  path: BabelJSXElementPath,
  state: BabelState,
  results: ElementTransformResults,
) {
  const children = filterChildren(path.get('children') as BabelJSXPath[])

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
            t.memberExpression(results.id, t.identifier('firstChild')),
          ),
        ]),
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
