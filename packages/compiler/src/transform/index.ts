import { transformNode } from './transformNode'
import { createTemplate } from '../createTemplate'
import { isDynamicResult, isElementResult, logger } from '../utils'

import type { BabelJSXPath, BabelState } from '../utils/types'

export function transformJSX(path: BabelJSXPath, state: BabelState) {
  if (state.get('skip')) return

  const result = transformNode(path, state)
  if (!result) return

  logger.info(result)

  if (isElementResult(result)) {
    path.replaceWith(createTemplate(result))
    return
  }

  if (isDynamicResult(result)) {
    path.replaceWith(result.expr)
  }
}
