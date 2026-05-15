import { TransformResult } from './results'
import { escapeHTML, trimJSXText } from '../utils/html'

import type { BabelJSXTextPath } from '../types'

export function transformText(path: BabelJSXTextPath) {
  const text = trimJSXText(path.node.value)

  if (!text.length) return null

  const escapedText = escapeHTML(text)

  return TransformResult.createText(escapedText)
}
