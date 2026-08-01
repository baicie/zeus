import * as t from '@babel/types'
import {
  attrBindingIR,
  eventBindingIR,
  propBindingIR,
  refBindingIR,
  staticAttrIR,
} from '@zeus-js/compiler-shared'

import { lowerExpressionIR } from '../adapters/babel/expression'
import { CompilerError, CompilerErrorCode } from '../diagnostics'
import { getJSXAttrName, toEventName } from '../parse/jsx'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'
import type { AttributeIR } from '@zeus-js/compiler-shared'

export function lowerAttribute(
  path: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
  _context: CompilerContext,
): AttributeIR | null {
  if (path.isJSXSpreadAttribute() || t.isJSXSpreadAttribute(path.node)) {
    throw new CompilerError({
      code: CompilerErrorCode.UNSUPPORTED_SPREAD_ATTRIBUTE,
      message: 'Spread attributes are not supported in Zeus MVP.',
      path,
      hint: 'Use explicit attributes instead, for example <div id={id} />.',
    })
  }

  const node = path.node
  const name = getJSXAttrName(node.name)
  const value = path.get('value')

  if (!value.node) {
    if (name === 'ref') {
      throw new CompilerError({
        code: CompilerErrorCode.EMPTY_EXPRESSION,
        message: 'ref attribute requires an expression.',
        path,
        hint: 'Use <div ref={target} /> instead.',
      })
    }
    return staticAttrIR(name, true)
  }

  if (value.isStringLiteral()) {
    if (name === 'ref') {
      throw new CompilerError({
        code: CompilerErrorCode.INVALID_REF_USAGE,
        message: 'String refs are not supported in Zeus.',
        path,
        hint: 'Use a state holder or callback ref: <div ref={el} />.',
      })
    }
    return staticAttrIR(name, value.node.value)
  }

  if (value.isJSXExpressionContainer()) {
    const expression = value.get('expression')

    if (expression.isJSXEmptyExpression()) {
      throw new CompilerError({
        code: CompilerErrorCode.EMPTY_EXPRESSION,
        message: `Attribute "${name}" expression cannot be empty.`,
        path,
      })
    }

    if (!expression.isExpression()) return null
    const expr = lowerExpressionIR(expression)

    if (name === 'ref') {
      return refBindingIR(expr)
    }

    if (name.startsWith('on') && name.length > 2) {
      return eventBindingIR(toEventName(name), expr)
    }

    if (name.startsWith('prop:')) {
      return propBindingIR(name.slice('prop:'.length), expr)
    }

    return attrBindingIR(name, expr)
  }

  return null
}
