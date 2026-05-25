import { textIR } from '../ir/semanticBuilders'
import { escapeHTML, trimJSXText } from '../utils/html'

import type { TextIR } from '../ir/nodes'
import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'

export function lowerText(path: NodePath<t.JSXText>): TextIR | null {
  const text = trimJSXText(path.node.value)
  return text ? textIR(escapeHTML(text)) : null
}
