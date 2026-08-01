import { textIR } from '@zeus-js/compiler-shared'

import { escapeHTML, trimJSXText } from '../utils/html'

import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { TextIR } from '@zeus-js/compiler-shared'

export function lowerText(path: NodePath<t.JSXText>): TextIR | null {
  const text = trimJSXText(path.node.value)
  return text ? textIR(escapeHTML(text)) : null
}
