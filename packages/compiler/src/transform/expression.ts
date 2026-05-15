import * as t from '@babel/types'

import { TransformResult } from './results'

import type { BabelJSXExpressionContainerPath } from '../types'

export function transformExpression(path: BabelJSXExpressionContainerPath) {
  const node = path.node

  if (node.expression == null || t.isJSXEmptyExpression(node.expression)) {
    return null
  }

  return TransformResult.createDynamic(node.expression)
}
