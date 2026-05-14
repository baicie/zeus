import { transformComponent, isComponentTag } from './component'
import { transformElementDOM } from './element'
import { transformExpression } from './expression'
import { transformFragment } from './fragment'
import { transformSpread } from './spread'
import { transformText } from './text'
import { getTagName, logger } from '../utils'

import type { BabelJSXPath, BabelState, TransformResults } from '../types'

export function transformNode(
  path: BabelJSXPath,
  state: BabelState,
): TransformResults | null {
  if (path.isJSXElement()) {
    const tagName = getTagName(path.node)

    if (isComponentTag(tagName)) {
      return transformComponent(path)
    }

    return transformElementDOM(path, state)
  }

  if (path.isJSXText()) {
    return transformText(path)
  }

  if (path.isJSXExpressionContainer()) {
    return transformExpression(path)
  }

  if (path.isJSXFragment()) {
    return transformFragment(path)
  }

  if (path.isJSXSpreadChild()) {
    return transformSpread(path)
  }

  logger.warn('Unknown JSX node type')
  return null
}
