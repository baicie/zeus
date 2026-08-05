import { createSSRFragment, serializeSSRNode } from './serialize'

import type { SSRFragment, SSRNode } from './types'

export function ssrStatic(html: string): SSRFragment {
  return createSSRFragment(html)
}

export function ssrText(value: SSRNode): SSRFragment {
  return createSSRFragment(serializeSSRNode(value))
}
