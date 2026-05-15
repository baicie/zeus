import * as t from '@babel/types'

import { createDynamicTransformResults } from '../types'

import type {
  BabelJSXExpressionContainerPath,
  DynamicTransformResults,
} from '../types'

export function transformExpression(
  path: BabelJSXExpressionContainerPath,
): DynamicTransformResults | null {
  const node = path.node

  if (node.expression == null || t.isJSXEmptyExpression(node.expression)) {
    return null
  }

  return createDynamicTransformResults(node.expression)
}
