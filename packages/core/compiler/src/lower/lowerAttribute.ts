import * as t from '@babel/types'
import {
  attrBindingIR,
  eventBindingIR,
  propBindingIR,
  refBindingIR,
  staticAttrIR,
} from '@zeus-js/compiler-shared'

import { createBabelCompilerError } from '../adapters/babel/diagnostic'
import {
  lowerExpressionIR,
  sourceSpanFromBabelNode,
} from '../adapters/babel/expression'
import { CompilerErrorCode } from '../diagnostics'
import { getJSXAttrName, toEventName } from '../parse/jsx'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'
import type { AttributeIR } from '@zeus-js/compiler-shared'

export function lowerAttribute(
  path: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
  _context: CompilerContext,
): AttributeIR | null {
  if (path.isJSXSpreadAttribute() || t.isJSXSpreadAttribute(path.node)) {
    throw createBabelCompilerError(path, {
      code: CompilerErrorCode.UNSUPPORTED_SPREAD_ATTRIBUTE,
      message: 'Spread attributes are not supported in Zeus MVP.',
      hint: 'Use explicit attributes instead, for example <div id={id} />.',
    })
  }

  const node = path.node
  const name = normalizeAttributeName(getJSXAttrName(node.name))
  const span = sourceSpanFromBabelNode(node)
  if (!span) throw new Error('JSX attribute is missing source offsets.')
  const value = path.get('value')

  if (!value.node) {
    if (name === 'ref') {
      throw createBabelCompilerError(path, {
        code: CompilerErrorCode.EMPTY_EXPRESSION,
        message: 'ref attribute requires an expression.',
        hint: 'Use <div ref={target} /> instead.',
      })
    }
    return staticAttrIR(name, true, span)
  }

  if (value.isStringLiteral()) {
    if (name === 'ref') {
      throw createBabelCompilerError(path, {
        code: CompilerErrorCode.INVALID_REF_USAGE,
        message: 'String refs are not supported in Zeus.',
        hint: 'Use a state holder or callback ref: <div ref={el} />.',
      })
    }
    return staticAttrIR(name, value.node.value, span)
  }

  if (value.isJSXExpressionContainer()) {
    const expression = value.get('expression')

    if (expression.isJSXEmptyExpression()) {
      throw createBabelCompilerError(path, {
        code: CompilerErrorCode.EMPTY_EXPRESSION,
        message: `Attribute "${name}" expression cannot be empty.`,
      })
    }

    if (!expression.isExpression()) return null
    const expr = lowerExpressionIR(expression)

    if (name === 'ref') {
      return refBindingIR(expr, span)
    }

    if (isEventAttributeName(name)) {
      return eventBindingIR(toEventName(name), expr, span)
    }

    if (name.startsWith('prop:')) {
      return propBindingIR(name.slice('prop:'.length), expr, span)
    }

    return attrBindingIR(name, expr, span)
  }

  return null
}

function normalizeAttributeName(name: string): string {
  return name === 'className' ? 'class' : name
}

function isEventAttributeName(name: string): boolean {
  return name.length > 2 && name.slice(0, 2).toLowerCase() === 'on'
}
