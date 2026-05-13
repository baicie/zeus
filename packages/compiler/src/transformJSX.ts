import * as t from '@babel/types'

import { transformElementDOM } from './element'
import { isJSXElementPath, logger } from './unit'

import type { BabelJSXElementPath, BabelJSXPath, BabelState } from './types'

export function transformJSX(path: BabelJSXPath, state: BabelState) {
  if (state.get('skip')) return

  // const metadata = getZeusMetadata(state)
  const result = transformNode(path, state)

  if (result) {
    logger.info(result)
  }
}

function transformNode(path: BabelJSXPath, state: BabelState) {
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

function transformElement(path: BabelJSXElementPath, state: BabelState) {
  // const node = path.node
  // const tagName = getTagName(node)

  // <Component ...></Component>
  // if (isComponent(tagName)) return transformComponent(path)

  return transformElementDOM(path, state)
}
