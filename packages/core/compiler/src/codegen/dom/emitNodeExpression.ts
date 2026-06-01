import * as t from '@babel/types'

import { emitFor, emitHost, emitShow, emitSlot } from './emitBuiltin'
import { emitComponent } from './emitComponent'
import { emitElement } from './emitElement'
import { emitFragment } from './emitFragment'

import type { CompilerContext } from '../../context'
import type { ZeusIRNode } from '../../ir/nodes'

export function emitNodeExpression(
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

    case 'Show':
      return emitShow(node, context)

    case 'For':
      return emitFor(node, context)

    case 'Host':
      return emitHost(node, context)

    case 'Slot':
      return emitSlot(node, context)

    default:
      return t.nullLiteral()
  }
}
