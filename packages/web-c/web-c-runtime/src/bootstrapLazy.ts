// packages/web-c-runtime/src/bootstrapLazy.ts

import { createLazyElementClass } from './lazy-element'

import type { ZeusLazyComponentMeta } from './types'

export interface BootstrapLazyOptions {
  registry?: CustomElementRegistry
}

export function bootstrapLazy(
  components: ZeusLazyComponentMeta[],
  options: BootstrapLazyOptions = {},
): void {
  const registry =
    options.registry ??
    (typeof customElements === 'undefined' ? undefined : customElements)

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
