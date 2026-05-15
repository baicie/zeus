import { escapeHTML, trimJSXText } from '../utils/html'

import type { BabelJSXTextPath, TextTransformResults } from '../types'

export function transformText(
  path: BabelJSXTextPath,
): TextTransformResults | null {
  const text = trimJSXText(path.node.value)

  if (!text.length) return null

  const escapedText = escapeHTML(text)

  return {
    kind: 'text',
    text: true,

    template: escapedText,
    templateWithClosingTags: escapedText,

    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],

    isSVG: false,
    hasCustomElement: false,
    isImportNode: false,
    skipTemplate: false,

    renderer: 'dom',
  }
}
