import * as t from '@babel/types'

import type { CompilerContext } from '../../context'
import type { ComponentIR } from '../../ir/nodes'

export function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('createComponent'), [
    node.callee,
    t.objectExpression(
      node.props.map(prop =>
        t.objectProperty(createObjectKey(prop.name), prop.value),
      ),
    ),
  ])
}

function createObjectKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}
