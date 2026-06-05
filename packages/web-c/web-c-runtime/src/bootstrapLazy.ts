// packages/web-c-runtime/src/bootstrapLazy.ts

import { createLazyElementClass } from './lazy-element'

import type { ZeusLazyComponentMeta } from './types'

export function bootstrapLazy(components: ZeusLazyComponentMeta[]): void {
  const registry =
    typeof customElements === 'undefined' ? undefined : customElements

  if (!registry) {
    return
  }

  for (const meta of components) {
    if (registry.get(meta.tagName)) {
      continue
    }

    const LazyElement = createLazyElementClass(meta)

    registry.define(meta.tagName, LazyElement)
  }
}
