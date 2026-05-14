import * as t from '@babel/types'

import type {
  BabelJSXExpressionContainerPath,
  DynamicTransformResults,
} from '../types'

export function transformExpression(
  path: BabelJSXExpressionContainerPath,
): DynamicTransformResults | null {
  const expr = path.node.expression

  if (t.isJSXEmptyExpression(expr)) {
    return null
  }

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
