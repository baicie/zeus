import * as t from '@babel/types'

import { transformElement } from './transformElement'
import { isJSXElementPath, logger } from '../utils/unit'

import type { BabelJSXPath, BabelState } from '../utils/types'

export function transformNode(path: BabelJSXPath, state: BabelState) {
  const node = path.node

  if (isJSXElementPath(path)) {
    return transformElement(path, state)
  } else if (t.isJSXFragment(node)) {
    logger.warn('JSXFragment is not supported')
    return
  } else if (t.isJSXText(node)) {
    logger.warn('JSXText is not supported')
    return
  } else if (t.isJSXExpressionContainer(node)) {
    logger.warn('JSXExpressionContainer is not supported')
    return
  } else if (t.isJSXSpreadChild(node)) {
    logger.warn('JSXSpreadChild is not supported')
    return
  } else {
    logger.warn('Unknown JSX node type')
    return
  }
}
