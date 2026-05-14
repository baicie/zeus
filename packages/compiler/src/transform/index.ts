import { transformNode } from './node'
import { createTemplate } from '../codegen'
import { isDynamicResult, isElementResult, logger } from '../utils'

import type { BabelJSXPath, BabelState } from '../types'

export function transformJSX(path: BabelJSXPath, state: BabelState) {
  if (state.get('skip')) return

  const result = transformNode(path, state)
  if (!result) return

  logger.info(result)

  if (isElementResult(result)) {
    path.replaceWith(createTemplate(path, result))
    return
  }

  if (isDynamicResult(result)) {
    path.replaceWith(result.expr)
  }
}
