import { collectChildren, buildChildrenExpr } from './children'
import { createDynamicTransformResults } from '../types'

import type {
  BabelJSXFragmentPath,
  BabelJSXPath,
  BabelState,
  DynamicTransformResults,
} from '../types'

export function transformFragment(
  path: BabelJSXFragmentPath,
  state: BabelState,
): DynamicTransformResults | null {
  const { nodes } = collectChildren(
    path.get('children') as BabelJSXPath[],
    state,
    path,
  )

  const expr = buildChildrenExpr(nodes)
  if (!expr) return null

  return createDynamicTransformResults(expr)
}
