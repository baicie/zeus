import * as t from '@babel/types'

import { emitDOM } from './index'

import type { CompilerContext } from '../../context'
import type { FragmentIR } from '../../ir/nodes'

export function emitFragment(
  node: FragmentIR,
  context: CompilerContext,
): t.Expression {
  return t.arrayExpression(node.children.map(child => emitDOM(child, context)))
}
