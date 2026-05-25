import * as t from '@babel/types'

import { emitComponent } from './emitComponent'
import { emitDomPath } from './emitDomPath'

import type { CompilerContext } from '../../context'
import type {
  AttrBindingIR,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
  ZeusIRNode,
} from '../../ir/nodes'

export function emitBindings(
  node: ElementIR,
  context: CompilerContext,
): t.Statement[] {
  const statements: t.Statement[] = []

  for (const attr of node.attrs) {
    if (attr.kind === 'AttrBinding') {
      statements.push(emitAttrBinding(node, attr, context))
    }

    if (attr.kind === 'EventBinding') {
      statements.push(emitEventBinding(node, attr, context))
    }
  }

  for (const child of node.children) {
    statements.push(...emitChildBinding(child, context))
  }

  return statements
}

function emitChildBinding(
  node: ZeusIRNode,
  context: CompilerContext,
): t.Statement[] {
  switch (node.kind) {
    case 'DynamicText':
      return emitDynamicText(node, context)
    case 'Component':
      return emitComponentInsert(node, context)
    case 'Element':
      return emitBindings(node, context)
    case 'Fragment':
      return node.children.flatMap(child => emitChildBinding(child, context))
    default:
      return []
  }
}

function emitAttrBinding(
  target: ElementIR,
  binding: AttrBindingIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindAttr'), [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.name),
      t.arrowFunctionExpression([], binding.expr),
    ]),
  )
}

function emitEventBinding(
  target: ElementIR,
  binding: EventBindingIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindEvent'), [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.eventName),
      binding.handler,
    ]),
  )
}

function emitDynamicText(
  node: DynamicTextIR,
  context: CompilerContext,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  const markerRef = context.uid('marker$')

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(markerRef, emitDomPath(node.domPath!, context)),
    ]),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.ref.name),
        t.callExpression(
          t.memberExpression(
            t.identifier('document'),
            t.identifier('createTextNode'),
          ),
          [t.stringLiteral('')],
        ),
      ),
    ]),
    t.expressionStatement(
      t.callExpression(context.importRuntime('insert'), [
        t.identifier(node.domPath.parent.name),
        t.identifier(node.ref.name),
        t.cloneNode(markerRef),
      ]),
    ),
    t.expressionStatement(
      t.callExpression(context.importRuntime('bindText'), [
        t.identifier(node.ref.name),
        t.arrowFunctionExpression([], node.expr),
      ]),
    ),
  ]
}

function emitComponentInsert(
  node: ComponentIR,
  context: CompilerContext,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  const markerRef = context.uid('marker$')

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(markerRef, emitDomPath(node.domPath, context)),
    ]),
    t.expressionStatement(
      t.callExpression(context.importRuntime('insert'), [
        t.identifier(node.domPath.parent.name),
        emitComponent(node, context),
        t.cloneNode(markerRef),
      ]),
    ),
  ]
}
