import * as t from '@babel/types'

import { lowerJSX } from './lowerJSX'
import { dynamicTextIR, ref, textIR } from '../ir/semanticBuilders'
import { escapeHTML, trimJSXText } from '../utils/html'

import type { CompilerContext } from '../context'
import type { ZeusIRNode } from '../ir/nodes'
import type { NodePath } from '@babel/core'

export function lowerChildren(
  children: NodePath<t.JSXElement['children'][number]>[],
  context: CompilerContext,
): ZeusIRNode[] {
  const result: ZeusIRNode[] = []

  for (const child of children) {
    if (child.isJSXText()) {
      const text = trimJSXText(child.node.value)
      if (text) result.push(textIR(escapeHTML(text)))
      continue
    }

    if (child.isJSXExpressionContainer()) {
      const expr = child.node.expression
      if (t.isJSXEmptyExpression(expr)) continue

      if (t.isExpression(expr)) {
        result.push(dynamicTextIR(expr, ref(context.uid('anchor$').name)))
      }

      continue
    }

    if (child.isJSXElement() || child.isJSXFragment()) {
      result.push(lowerJSX(child, context))
      continue
    }
  }

  return result
}
