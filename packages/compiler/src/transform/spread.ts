import { TransformResult } from './results'

import type { BabelJSXSpreadChildPath } from '../types'

export function transformSpread(path: BabelJSXSpreadChildPath) {
  return TransformResult.createDynamic(path.node.expression)
}
