import * as t from '@babel/types'

import { emitMountFor, emitMountShow, emitSlot } from './emitBuiltin'
import { emitComponent } from './emitComponent'
import { isRawTextElement } from '../../utils/html'
import { registerEvent } from '../support/events'

import type { CompilerContext } from '../../context'
import type {
  AttrBindingIR,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
  ForIR,
  RefBindingIR,
  ShowIR,
  SlotIR,
  PropBindingIR,
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

    if (attr.kind === 'PropBinding') {
      statements.push(emitPropBinding(node, attr, context))
    }

    if (attr.kind === 'RefBinding') {
      statements.push(emitRefBinding(node, attr, context))
    }
  }

  if (isRawTextElement(node.tagName) && hasRuntimeRawText(node.children)) {
    statements.push(emitRawTextBinding(node, context))
    return statements
  }

  for (const child of node.children) {
    statements.push(...emitChildBinding(child, context))
  }

  return statements
}

function emitRawTextBinding(
  node: ElementIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindTextContent'), [
      t.identifier(node.ref.name),
      t.arrowFunctionExpression([], emitRawTextValue(node.children)),
    ]),
  )
}

function hasRuntimeRawText(children: ZeusIRNode[]): boolean {
  return children.some(child => {
    if (child.kind === 'Text') return false
    if (child.kind === 'Fragment') return hasRuntimeRawText(child.children)
    return true
  })
}

function emitRawTextValue(children: ZeusIRNode[]): t.Expression {
  const values = children.flatMap(child => {
    switch (child.kind) {
      case 'Text':
        return [t.stringLiteral(child.value)]
      case 'DynamicText':
        return [child.expr]
      case 'Fragment':
        return [emitRawTextValue(child.children)]
      default:
        return []
    }
  })

  if (values.length === 0) return t.stringLiteral('')
  if (values.length === 1) return values[0]

  return t.arrayExpression(values)
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
    case 'Show':
      return emitMarkerMount(node, context, emitMountShow(node, context))
    case 'For':
      return emitMarkerMount(node, context, emitMountFor(node, context))
    case 'Slot':
      return emitMarkerInsert(node, context, emitSlot(node, context))
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
  const name = normalizeAttrName(binding.name)

  if (name === 'class') {
    return t.expressionStatement(
      t.callExpression(context.importRuntime('bindClass'), [
        t.identifier(target.ref.name),
        t.arrowFunctionExpression([], binding.expr),
      ]),
    )
  }

  if (name === 'style') {
    return t.expressionStatement(
      t.callExpression(context.importRuntime('bindStyle'), [
        t.identifier(target.ref.name),
        t.arrowFunctionExpression([], binding.expr),
      ]),
    )
  }

  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindAttr'), [
      t.identifier(target.ref.name),
      t.stringLiteral(name),
      t.arrowFunctionExpression([], binding.expr),
    ]),
  )
}

function normalizeAttrName(name: string): string {
  return name === 'className' ? 'class' : name
}

function emitEventBinding(
  target: ElementIR,
  binding: EventBindingIR,
  context: CompilerContext,
): t.Statement {
  registerEvent(context.programPath, binding.eventName)

  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindEvent'), [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.eventName),
      binding.handler,
    ]),
  )
}

function emitPropBinding(
  target: ElementIR,
  binding: PropBindingIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindProp'), [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.name),
      t.arrowFunctionExpression([], binding.expr),
    ]),
  )
}

function emitRefBinding(
  target: ElementIR,
  binding: RefBindingIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindRef'), [
      t.identifier(target.ref.name),
      binding.expr,
    ]),
  )
}

function emitDynamicText(
  node: DynamicTextIR,
  context: CompilerContext,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  const textRef = context.uid('text$')

  if (node.once) {
    return [
      t.variableDeclaration('const', [
        t.variableDeclarator(
          textRef,
          t.callExpression(
            t.memberExpression(
              t.identifier('document'),
              t.identifier('createTextNode'),
            ),
            [t.callExpression(t.identifier('String'), [node.expr])],
          ),
        ),
      ]),
      t.expressionStatement(
        t.callExpression(context.importRuntime('insert'), [
          t.identifier(node.domPath.parent.name),
          textRef,
          t.identifier(node.ref.name),
        ]),
      ),
    ]
  }

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        textRef,
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
        textRef,
        t.identifier(node.ref.name),
      ]),
    ),
    t.expressionStatement(
      t.callExpression(context.importRuntime('bindText'), [
        textRef,
        t.arrowFunctionExpression([], node.expr),
      ]),
    ),
  ]
}

function emitComponentInsert(
  node: ComponentIR,
  context: CompilerContext,
): t.Statement[] {
  return emitMarkerInsert(node, context, emitComponent(node, context))
}

function emitMarkerInsert(
  node: ComponentIR | ShowIR | ForIR | SlotIR,
  context: CompilerContext,
  value: t.Expression,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  return [
    t.expressionStatement(
      t.callExpression(context.importRuntime('insert'), [
        t.identifier(node.domPath.parent.name),
        value,
        t.identifier(node.ref.name),
      ]),
    ),
  ]
}

function emitMarkerMount(
  node: ShowIR | ForIR,
  context: CompilerContext,
  mountCall: t.Expression,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  return [t.expressionStatement(mountCall)]
}
