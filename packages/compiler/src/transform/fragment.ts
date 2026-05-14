import * as t from '@babel/types'

import { transformNode } from './node'
import { createTemplate } from '../codegen'
import { escapeHTML, trimJSXText } from '../utils'

import type {
  BabelJSXFragmentPath,
  BabelJSXPath,
  BabelState,
  DynamicTransformResults,
} from '../types'

export function transformFragment(
  path: BabelJSXFragmentPath,
  state: BabelState,
): DynamicTransformResults | null {
  const children = filterFragmentChildren(
    path.get('children') as BabelJSXPath[],
  )

  const nodes: t.Expression[] = []

  children.forEach(child => {
    if (child.isJSXText()) {
      const text = trimJSXText(child.node.value)

      if (text.length) {
        nodes.push(t.stringLiteral(escapeHTML(text)))
      }

      return
    }

    const result = transformNode(child, state)

    if (!result) return

    if (result.kind === 'element') {
      nodes.push(createTemplate(path, result))
      return
    }

    if (result.kind === 'dynamic') {
      nodes.push(result.expr)
      return
    }

    if (result.kind === 'text') {
      nodes.push(t.stringLiteral(result.template))
    }
  })

  if (!nodes.length) return null

  return {
    kind: 'dynamic',
    dynamic: true,

    expr: nodes.length === 1 ? nodes[0] : t.arrayExpression(nodes),

    template: '',
    templateWithClosingTags: '',

    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],

    isSVG: false,
    hasCustomElement: false,
    isImportNode: false,
    skipTemplate: false,

    renderer: 'dom',
  }
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
