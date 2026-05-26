import * as t from '@babel/types'

import { CompilerError, CompilerErrorCode } from '../diagnostics'
import {
  forIR,
  hostIR,
  dynamicTextIR,
  ref,
  showIR,
  slotIR,
  type ZeusIRNode,
} from '../ir'
import { lowerChildren } from './lowerChildren'
import { lowerJSX } from './lowerJSX'
import { getJSXAttrName } from '../parse/jsx'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'

export function isBuiltinTag(tagName: string): boolean {
  return (
    tagName === 'Show' ||
    tagName === 'For' ||
    tagName === 'Host' ||
    tagName === 'Slot'
  )
}

export function lowerBuiltin(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const tagName = path.node.openingElement.name

  if (!t.isJSXIdentifier(tagName)) {
    throw new CompilerError({
      code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
      message: 'Built-in JSX nodes do not support member expressions.',
      path,
    })
  }

  switch (tagName.name) {
    case 'Show':
      return lowerShow(path, context)
    case 'For':
      return lowerFor(path, context)
    case 'Host':
      return hostIR(lowerChildren(path.get('children'), context))
    case 'Slot':
      return lowerSlot(path, context)
    default:
      throw new CompilerError({
        code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
        message: `Unsupported built-in <${tagName.name}>.`,
        path,
      })
  }
}

function lowerShow(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const when = requiredExpressionAttr(path, 'when')
  const fallback = optionalExpressionAttr(path, 'fallback')

  return showIR({
    ref: ref(context.uid('show$').name),
    when,
    fallback,
    children: lowerChildren(path.get('children'), context),
  })
}

function lowerFor(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const each = requiredExpressionAttr(path, 'each')
  const by = optionalExpressionAttr(path, 'by')
  const render = getOnlyRenderFunction(path)
  const item = getParamIdentifier(render, 0) ?? t.identifier('item')
  const index = getParamIdentifier(render, 1)
  const bodyPath = render.get('body')
  const body: ZeusIRNode[] = []

  if (bodyPath.isJSXElement() || bodyPath.isJSXFragment()) {
    body.push(lowerJSX(bodyPath, context))
  } else if (bodyPath.isExpression()) {
    body.push(dynamicTextIR(bodyPath.node, ref(context.uid('text$').name)))
  }

  return forIR({
    ref: ref(context.uid('for$').name),
    each,
    by,
    item,
    index,
    body,
  })
}

function lowerSlot(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const name = optionalStringAttr(path, 'name')

  return slotIR({
    name,
    fallback: lowerChildren(path.get('children'), context),
  })
}

function requiredExpressionAttr(
  path: NodePath<t.JSXElement>,
  name: string,
): t.Expression {
  const value = optionalExpressionAttr(path, name)

  if (!value || Array.isArray(value)) {
    throw new CompilerError({
      code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
      message: `<${getBuiltinName(path)}> requires "${name}".`,
      path,
    })
  }

  return value
}

function optionalExpressionAttr(
  path: NodePath<t.JSXElement>,
  name: string,
): t.Expression | undefined {
  const attr = path
    .get('openingElement')
    .get('attributes')
    .find(attrPath => {
      if (!attrPath.isJSXAttribute()) return false
      return getJSXAttrName(attrPath.node.name) === name
    })

  if (!attr?.isJSXAttribute()) return undefined

  const value = attr.node.value

  if (!value) return t.booleanLiteral(true)
  if (t.isStringLiteral(value)) return value

  if (
    t.isJSXExpressionContainer(value) &&
    !t.isJSXEmptyExpression(value.expression)
  ) {
    return value.expression
  }

  return undefined
}

function optionalStringAttr(
  path: NodePath<t.JSXElement>,
  name: string,
): string | undefined {
  const attr = path
    .get('openingElement')
    .get('attributes')
    .find(attrPath => {
      if (!attrPath.isJSXAttribute()) return false
      return getJSXAttrName(attrPath.node.name) === name
    })

  if (!attr?.isJSXAttribute()) return undefined

  const value = attr.node.value

  if (!value) return ''
  if (t.isStringLiteral(value)) return value.value

  return undefined
}

function getOnlyRenderFunction(
  path: NodePath<t.JSXElement>,
): NodePath<t.ArrowFunctionExpression | t.FunctionExpression> {
  const expressions = path
    .get('children')
    .filter(child => child.isJSXExpressionContainer())
    .map(child => child.get('expression'))
    .filter(
      (
        expression,
      ): expression is NodePath<
        t.ArrowFunctionExpression | t.FunctionExpression
      > =>
        expression.isArrowFunctionExpression() ||
        expression.isFunctionExpression(),
    )

  if (expressions.length !== 1) {
    throw new CompilerError({
      code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
      message: '<For> requires exactly one render function child.',
      path,
    })
  }

  return expressions[0]
}

function getParamIdentifier(
  path: NodePath<t.ArrowFunctionExpression | t.FunctionExpression>,
  index: number,
  fallback?: string,
): t.Identifier | undefined {
  const param = path.node.params[index]

  if (t.isIdentifier(param)) return param
  if (fallback) return t.identifier(fallback)

  return undefined
}

function getBuiltinName(path: NodePath<t.JSXElement>): string {
  const name = path.node.openingElement.name
  return t.isJSXIdentifier(name) ? name.name : 'Builtin'
}
