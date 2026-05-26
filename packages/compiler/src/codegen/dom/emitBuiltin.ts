import * as t from '@babel/types'

import { emitChildrenProp } from './emitComponent'

import type { CompilerContext } from '../../context'
import type { ForIR, HostIR, ShowIR, SlotIR } from '../../ir/nodes'

export function emitShow(node: ShowIR, context: CompilerContext): t.Expression {
  const props: t.ObjectProperty[] = [
    t.objectProperty(t.identifier('when'), node.when),
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
          : node.fallback,
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
    t.arrowFunctionExpression([], node.when),
    t.arrowFunctionExpression([], emitChildrenProp(node.children, context)),
    node.fallback
      ? Array.isArray(node.fallback)
        ? t.arrowFunctionExpression(
            [],
            emitChildrenProp(node.fallback, context),
          )
        : t.arrowFunctionExpression([], node.fallback)
      : t.identifier('undefined'),
  ])
}

export function emitFor(node: ForIR, context: CompilerContext): t.Expression {
  const params: t.Identifier[] = [node.item]

  if (node.index) params.push(node.index)

  const props: t.ObjectProperty[] = [
    t.objectProperty(t.identifier('each'), node.each),
    t.objectProperty(
      t.identifier('children'),
      t.arrowFunctionExpression(params, emitChildrenProp(node.body, context)),
    ),
  ]

  if (node.by) {
    props.push(t.objectProperty(t.identifier('by'), node.by))
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
  const params: t.Identifier[] = [node.item]
  const path = node.domPath

  if (node.index) params.push(node.index)
  if (!path || path.kind !== 'Marker') {
    throw new Error('For DOM path is not assigned')
  }

  return t.callExpression(context.importRuntime('mountFor'), [
    t.identifier(path.parent.name),
    emitMarkerIdentifier(node),
    t.arrowFunctionExpression([], node.each),
    node.by ?? t.identifier('undefined'),
    t.arrowFunctionExpression(params, emitChildrenProp(node.body, context)),
  ])
}

export function emitHost(node: HostIR, context: CompilerContext): t.Expression {
  return emitChildrenProp(node.children, context)
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
