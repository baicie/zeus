import * as t from '@babel/types'

import { emitFor, emitHost, emitShow, emitSlot } from './emitBuiltin'
import { emitComponent } from './emitComponent'
import { emitElement } from './emitElement'
import { emitFragment } from './emitFragment'

import type { CompilerContext } from '../../context'
import type { ZeusIRNode } from '../../ir/nodes'

export function emitDOM(
  node: ZeusIRNode,
  context: CompilerContext,
): t.Expression {
  switch (node.kind) {
    case 'Element':
      return emitElement(node, context)
    case 'Fragment':
      return emitFragment(node, context)
    case 'Component':
      return emitComponent(node, context)
    case 'Show':
      return emitShow(node, context)
    case 'For':
      return emitFor(node, context)
    case 'Host':
      return emitHost(node, context)
    case 'Slot':
      return emitSlot(node, context)
    case 'DynamicText':
      return t.arrowFunctionExpression([], node.expr)
    default:
      throw new Error(`Unsupported root IR node: ${node.kind}`)
  }
}
