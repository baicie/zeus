import * as t from '@babel/types'

import type {
  BabelJSXExpressionContainerPath,
  DynamicTransformResults,
} from '../types'

export function transformExpression(
  path: BabelJSXExpressionContainerPath,
): DynamicTransformResults | null {
  const node = path.node

  if (t.isJSXEmptyExpression(node.expression)) {
    return null
  }

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
