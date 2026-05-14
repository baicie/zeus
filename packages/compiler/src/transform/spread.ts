import type { BabelJSXSpreadChildPath, DynamicTransformResults } from '../types'

export function transformSpread(
  path: BabelJSXSpreadChildPath,
): DynamicTransformResults {
  const node = path.node

  return {
    kind: 'dynamic',
    dynamic: true,

    expr: node.expression,

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
