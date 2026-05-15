import { collectChildren, buildChildrenExpr } from './children'

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

  return {
    kind: 'dynamic',
    dynamic: true,
    expr,

    template: '',
    templateWithClosingTags: '',

    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],

    isSVG: false,
    hasCustomElement: false,
    isImportNode: false,
    skipTemplate: false,

    renderer: 'dom',
  }
}
