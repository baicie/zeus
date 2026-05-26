import * as t from '@babel/types'

import { emitNodeExpression } from './emitNodeExpression'

import type { CompilerContext } from '../../context'
import type { ComponentIR, ComponentPropIR, ZeusIRNode } from '../../ir/nodes'

export function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('createComponent'), [
    node.callee,
    t.objectExpression(
      node.props.map(prop => emitComponentProp(prop, context)),
    ),
  ])
}

function emitComponentProp(
  prop: ComponentPropIR,
  context: CompilerContext,
): t.ObjectProperty | t.ObjectMethod {
  const key = createObjectKey(prop.name)

  if (Array.isArray(prop.value)) {
    return t.objectProperty(key, emitChildrenProp(prop.value, context))
  }

  if (isStaticPropValue(prop.value)) {
    return t.objectProperty(key, prop.value)
  }

  return t.objectMethod(
    'get',
    key,
    [],
    t.blockStatement([t.returnStatement(prop.value)]),
  )
}

export function emitChildrenProp(
  children: ZeusIRNode[],
  context: CompilerContext,
): t.Expression {
  const nodes = children.map(child => emitNodeExpression(child, context))

  if (nodes.length === 1) return nodes[0]
  return t.arrayExpression(nodes)
}

function isStaticPropValue(value: t.Expression): boolean {
  return (
    t.isStringLiteral(value) ||
    t.isNumericLiteral(value) ||
    t.isBooleanLiteral(value) ||
    t.isNullLiteral(value)
  )
}

function createObjectKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}
