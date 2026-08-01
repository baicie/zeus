import * as t from '@babel/types'

import { emitChildrenProp } from './emitComponent'
import { emitNodeExpression } from './emitNodeExpression'
import { parseExpressionIR } from '../../adapters/babel/expression'

import type { CompilerContext } from '../../context'
import type { ForIR, HostIR, ShowIR, SlotIR } from '@zeus-js/compiler-shared'

export function emitShow(node: ShowIR, context: CompilerContext): t.Expression {
  const props: t.ObjectProperty[] = [
    t.objectProperty(t.identifier('when'), parseExpressionIR(node.when)),
    t.objectProperty(
      t.identifier('children'),
      t.arrowFunctionExpression([], emitChildrenProp(node.children, context)),
    ),
  ]

  if (node.fallback) {
    props.push(
      t.objectProperty(
        t.identifier('fallback'),
        Array.isArray(node.fallback)
          ? t.arrowFunctionExpression(
              [],
              emitChildrenProp(node.fallback, context),
            )
          : parseExpressionIR(node.fallback),
      ),
    )
  }

  return t.callExpression(context.importRuntime('createComponent'), [
    context.importRuntime('Show'),
    t.objectExpression(props),
  ])
}

export function emitMountShow(
  node: ShowIR,
  context: CompilerContext,
): t.Expression {
  const path = node.domPath

  if (!path || path.kind !== 'Marker') {
    throw new Error('Show DOM path is not assigned')
  }

  return t.callExpression(context.importRuntime('mountShow'), [
    t.identifier(path.parent.name),
    emitMarkerIdentifier(node),
    t.arrowFunctionExpression([], parseExpressionIR(node.when)),
    t.arrowFunctionExpression([], emitChildrenProp(node.children, context)),
    node.fallback
      ? Array.isArray(node.fallback)
        ? t.arrowFunctionExpression(
            [],
            emitChildrenProp(node.fallback, context),
          )
        : t.arrowFunctionExpression([], parseExpressionIR(node.fallback))
      : t.identifier('undefined'),
  ])
}

export function emitFor(node: ForIR, context: CompilerContext): t.Expression {
  const params: t.Identifier[] = [t.identifier(node.item.name)]

  if (node.index) params.push(t.identifier(node.index.name))

  const props: t.ObjectProperty[] = [
    t.objectProperty(t.identifier('each'), parseExpressionIR(node.each)),
    t.objectProperty(
      t.identifier('children'),
      t.arrowFunctionExpression(params, emitChildrenProp(node.body, context)),
    ),
  ]

  if (node.by) {
    props.push(t.objectProperty(t.identifier('by'), parseExpressionIR(node.by)))
  }

  return t.callExpression(context.importRuntime('createComponent'), [
    context.importRuntime('For'),
    t.objectExpression(props),
  ])
}

export function emitMountFor(
  node: ForIR,
  context: CompilerContext,
): t.Expression {
  const params: t.Identifier[] = [t.identifier(node.item.name)]

  if (node.index) params.push(t.identifier(node.index.name))
  const path = node.domPath

  if (!path || path.kind !== 'Marker') {
    throw new Error('For DOM path is not assigned')
  }

  return t.callExpression(context.importRuntime('mountFor'), [
    t.identifier(path.parent.name),
    emitMarkerIdentifier(node),
    t.arrowFunctionExpression([], parseExpressionIR(node.each)),
    node.by ? parseExpressionIR(node.by) : t.identifier('undefined'),
    t.arrowFunctionExpression(params, emitChildrenProp(node.body, context)),
  ])
}

export function emitHost(node: HostIR, context: CompilerContext): t.Expression {
  const props = buildHostProps(node, context)
  const hostIdent = context.importRuntime('Host')

  if (!node.child) {
    return t.callExpression(hostIdent, [t.objectExpression(props)])
  }

  const childExpr = emitNodeExpression(node.child, context)
  const hostCall = t.callExpression(hostIdent, [t.objectExpression(props)])

  return t.callExpression(
    t.arrowFunctionExpression(
      [],
      t.blockStatement([
        t.expressionStatement(hostCall),
        t.returnStatement(childExpr as t.Expression),
      ]),
    ),
    [],
  )
}

function buildHostProps(
  node: HostIR,
  context: CompilerContext,
): t.ObjectProperty[] {
  const props: t.ObjectProperty[] = []

  for (const attr of node.attrs) {
    const key = createObjectKey(attr.name)
    const expression = parseExpressionIR(attr.expr)

    if (isStaticValue(expression) || isGetterExpression(expression)) {
      props.push(t.objectProperty(key, expression))
    } else {
      props.push(
        t.objectProperty(key, t.arrowFunctionExpression([], expression)),
      )
    }
  }

  return props
}

function isStaticValue(expr: t.Expression): boolean {
  return (
    t.isStringLiteral(expr) ||
    t.isNumericLiteral(expr) ||
    t.isBooleanLiteral(expr) ||
    t.isNullLiteral(expr)
  )
}

function isGetterExpression(expr: t.Expression): boolean {
  return t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)
}

function createObjectKey(name: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(name) ? t.identifier(name) : t.stringLiteral(name)
}

export function emitSlot(node: SlotIR, context: CompilerContext): t.Expression {
  return t.callExpression(context.importRuntime('createSlot'), [
    node.name ? t.stringLiteral(node.name) : t.identifier('undefined'),
    node.fallback.length > 0
      ? t.arrowFunctionExpression([], emitChildrenProp(node.fallback, context))
      : t.identifier('undefined'),
  ])
}

function emitMarkerIdentifier(node: ShowIR | ForIR): t.Identifier {
  return t.identifier(node.ref.name)
}
