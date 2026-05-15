import { transformElement } from './element'
import { transformExpression } from './expression'
import { transformFragment } from './fragment'
import { transformSpread } from './spread'
import { transformText } from './text'
import { CompilerError, CompilerErrorCode } from '../diagnostics'

import type { BabelJSXPath, BabelState, TransformResults } from '../types'

export function transformNode(
  path: BabelJSXPath,
  state: BabelState,
): TransformResults | null {
  if (path.isJSXElement()) {
    return transformElement(path, state)
  } else if (path.isJSXText()) {
    return transformText(path)
  } else if (path.isJSXExpressionContainer()) {
    return transformExpression(path)
  } else if (path.isJSXFragment()) {
    return transformFragment(path, state)
  } else if (path.isJSXSpreadChild()) {
    return transformSpread(path)
  } else {
    throw new CompilerError({
      code: CompilerErrorCode.UNSUPPORTED_NODE,
      message: 'Unknown JSX node type.',
      path,
    })
  }
}
