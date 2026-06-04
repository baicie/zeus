// packages/web-c-runtime/src/bootstrapLazy.ts

import { createLazyElementClass } from './lazy-element'

import type { BootstrapLazyOptions, ZeusLazyComponentMeta } from './types'

export function bootstrapLazy(
  components: ZeusLazyComponentMeta[],
  options: BootstrapLazyOptions = {},
): void {
  const registry = options.registry ?? customElements

  for (const meta of components) {
    if (registry.get(meta.tagName)) {
      continue
    }

    const LazyElement = createLazyElementClass(meta)

    registry.define(meta.tagName, LazyElement)
  }
}
