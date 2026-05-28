import * as t from '@babel/types'

import { emitNodeExpression } from './emitNodeExpression'

import type { CompilerContext } from '../../context'
import type { ComponentIR, ComponentPropIR, ZeusIRNode } from '../../ir/nodes'

/**
 * Returns true when `callee` is a context boundary — specifically
 * `SomeContext.Provider` or `SomeContext.Bridge`. These must NOT be
 * wrapped with `createComponent` because the Provider/Bridge function
 * itself already creates an owner scope for context distribution.
 *
 * Detection heuristic: member expression whose property name is exactly
 * "Provider" or "Bridge". This covers the standard pattern from
 * `createContext()` where `Context.Provider` is a property function.
 */
function isContextBoundaryCallee(callee: t.Expression): boolean {
  return (
    t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.property) &&
    (callee.property.name === 'Provider' || callee.property.name === 'Bridge')
  )
}

export function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  const props = t.objectExpression(
    node.props.map(prop => emitComponentProp(prop, context)),
  )

  // Context boundaries (Provider / Bridge) manage their own owner scope and
  // must be called directly. Wrapping them with createComponent would create
  // a redundant intermediate owner and break the context lookup chain.
  if (isContextBoundaryCallee(node.callee)) {
    return t.callExpression(node.callee, [props])
  }

  return t.callExpression(context.importRuntime('createComponent'), [
    node.callee,
    props,
  ])
}

function emitComponentProp(
  prop: ComponentPropIR,
  context: CompilerContext,
): t.ObjectProperty | t.ObjectMethod {
  const key = createObjectKey(prop.name)

  if (Array.isArray(prop.value)) {
    // Children must be a getter so that the Provider can evaluate them inside
    // its own owner context. Evaluating eagerly would break context scoping.
    return t.objectMethod(
      'get',
      key,
      [],
      t.blockStatement([
        t.returnStatement(emitChildrenProp(prop.value, context)),
      ]),
    )
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
