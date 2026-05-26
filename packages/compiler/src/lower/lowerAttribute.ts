import * as t from '@babel/types'

import { CompilerError, CompilerErrorCode } from '../diagnostics'
import {
  attrBindingIR,
  eventBindingIR,
  propBindingIR,
  refBindingIR,
  staticAttrIR,
} from '../ir/semanticBuilders'
import { getJSXAttrName, toEventName } from '../parse/jsx'

import type { CompilerContext } from '../context'
import type { AttributeIR } from '../ir/nodes'
import type { NodePath } from '@babel/core'

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
  const value = node.value

  if (!value) {
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

  if (t.isStringLiteral(value)) {
    if (name === 'ref') {
      throw new CompilerError({
        code: CompilerErrorCode.INVALID_REF_USAGE,
        message: 'String refs are not supported in Zeus.',
        path,
        hint: 'Use a state holder or callback ref: <div ref={el} />.',
      })
    }
    return staticAttrIR(name, value.value)
  }

  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression

    if (t.isJSXEmptyExpression(expr)) {
      throw new CompilerError({
        code: CompilerErrorCode.EMPTY_EXPRESSION,
        message: `Attribute "${name}" expression cannot be empty.`,
        path,
      })
    }

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
