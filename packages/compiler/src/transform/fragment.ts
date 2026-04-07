import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import { nullLiteral } from '@babel/types'
import type { TransformInfo, TransformResult } from '../shared/types'

export function transformFragmentNode(
  path: NodePath<t.JSXFragment>,
  _info: TransformInfo,
): TransformResult {
  if (path.node.children.length > 0) {
    throw new Error(
      '[zeus-jsx] JSX Fragment with children is not implemented yet.',
    )
  }
  return {
    template: '',
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    outputExpr: nullLiteral(),
  }
}
