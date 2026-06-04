// packages/web-c-runtime/src/bootstrapLazy.ts

import { createLazyElementClass } from './lazy-element'

import type { ZeusLazyComponentMeta } from './types'

export function bootstrapLazy(components: ZeusLazyComponentMeta[]): void {
  if (typeof customElements === 'undefined') {
    return
  }

  for (const meta of components) {
    if (customElements.get(meta.tagName)) {
      continue
    }

    const LazyElement = createLazyElementClass(meta)

    customElements.define(meta.tagName, LazyElement)
  }
}
