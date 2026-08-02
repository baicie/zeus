import { dynamicTextIR, ref, textIR } from '@zeus-js/compiler-shared'

import { lowerJSX } from './lowerJSX'
import { lowerExpressionIR } from '../adapters/babel/expression'
import { escapeHTML, trimJSXText } from '../utils/html'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { ZeusIRNode } from '@zeus-js/compiler-shared'

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
      const expression = child.get('expression')
      if (expression.isJSXEmptyExpression()) continue

      if (expression.isExpression()) {
        result.push(
          dynamicTextIR(
            lowerExpressionIR(expression),
            ref(context.uid('anchor$').name),
          ),
        )
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
