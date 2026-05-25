import * as t from '@babel/types'

import type { CompilerContext } from '../../context'
import type { DomPath } from '../../ir/nodes'

export function emitDomPath(
  path: DomPath,
  context: CompilerContext,
): t.Expression {
  switch (path.kind) {
    case 'Root':
      throw new Error('Root path is emitted from template clone directly')

    case 'FirstChild':
      return t.memberExpression(
        t.identifier(path.parent.name),
        t.identifier('firstChild'),
      )

    case 'NextSibling':
      return t.memberExpression(
        t.identifier(path.previous.name),
        t.identifier('nextSibling'),
      )

    case 'Marker':
      return t.callExpression(context.importRuntime('marker'), [
        t.identifier(path.parent.name),
        t.numericLiteral(path.index),
      ])
  }
}
