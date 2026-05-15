import { createDynamicTransformResults } from '../types'

import type { BabelJSXSpreadChildPath, DynamicTransformResults } from '../types'

export function transformSpread(
  path: BabelJSXSpreadChildPath,
): DynamicTransformResults {
  return createDynamicTransformResults(path.node.expression)
}
