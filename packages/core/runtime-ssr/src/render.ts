import { createRoot } from '@zeus-js/signal'

import { serializeSSRNode } from './serialize'

import type { SSRRenderInput } from './types'

export function renderToString(input: SSRRenderInput): string {
  if (typeof input !== 'function') {
    throw new TypeError(
      'renderToString() expects a synchronous render function.',
    )
  }

  return createRoot(dispose => {
    try {
      return serializeSSRNode(input())
    } finally {
      dispose()
    }
  })
}
