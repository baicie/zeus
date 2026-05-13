import { transformElement } from './transformElement'
import { transformText } from './transformText'
import { logger } from '../utils/helpers'

import type { BabelJSXPath, BabelState } from '../utils/types'

export function transformNode(path: BabelJSXPath, state: BabelState) {
  // const node = path.node

  if (path.isJSXElement()) {
    return transformElement(path, state)
  } else if (path.isJSXFragment()) {
    logger.warn('JSXFragment is not supported')
    return
  } else if (path.isJSXText()) {
    return transformText(path)
  } else if (path.isJSXExpressionContainer()) {
    logger.warn('JSXExpressionContainer is not supported')
    return
  } else if (path.isJSXSpreadChild()) {
    logger.warn('JSXSpreadChild is not supported')
    return
  } else {
    logger.warn('Unknown JSX node type')
    return
  }
}
