import * as t from '@babel/types'

import { emitElement } from './emitElement'
import { emitFragment } from './emitFragment'

import type { CompilerContext } from '../../context'
import type { ComponentIR, ZeusIRNode } from '../../ir/nodes'

export function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('createComponent'), [
    node.callee,
    t.objectExpression(
      node.props.map(prop =>
        t.objectProperty(
          createObjectKey(prop.name),
          Array.isArray(prop.value)
            ? emitChildrenProp(prop.value, context)
            : prop.value,
        ),
      ),
    ),
  ])
}

export function emitChildrenProp(
  children: ZeusIRNode[],
  context: CompilerContext,
): t.Expression {
  const nodes = children.map(child => emitChildProp(child, context))

  if (nodes.length === 1) return nodes[0]
  return t.arrayExpression(nodes)
}

export function emitChildProp(
  node: ZeusIRNode,
  context: CompilerContext,
): t.Expression {
  switch (node.kind) {
    case 'Text':
      return t.stringLiteral(node.value)
    case 'DynamicText':
      return node.expr
    case 'Element':
      return emitElement(node, context)
    case 'Component':
      return emitComponent(node, context)
    case 'Fragment':
      return emitFragment(node, context)
    default:
      return t.nullLiteral()
  }
}

function createObjectKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}
