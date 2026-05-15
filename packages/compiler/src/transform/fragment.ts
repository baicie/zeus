import { collectChildren, buildChildrenExpr } from './children'
import { TransformResult } from './results'

import type { BabelJSXFragmentPath, BabelJSXPath, BabelState } from '../types'

export function transformFragment(
  path: BabelJSXFragmentPath,
  state: BabelState,
) {
  const { nodes } = collectChildren(
    path.get('children') as BabelJSXPath[],
    state,
    path,
  )

  const expr = buildChildrenExpr(nodes)
  if (!expr) return null

  return TransformResult.createDynamic(expr)
}
