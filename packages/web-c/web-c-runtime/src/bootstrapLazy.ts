// packages/web-c-runtime/src/bootstrapLazy.ts

import { createLazyElementClass } from './lazy-element'

import type { ZeusLazyComponentMeta } from './types'

const definitions = new WeakMap<
  CustomElementConstructor,
  ZeusLazyComponentMeta
>()

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
    const existing = registry.get(meta.tagName)
    if (existing) {
      const registered = definitions.get(existing)
      if (registered === meta) continue
      throw new Error(
        `[ZEUS_WC_DUPLICATE_TAG] <${meta.tagName}> is already registered with a different definition.`,
      )
    }

    const LazyElement = createLazyElementClass(meta)

    registry.define(meta.tagName, LazyElement)
    definitions.set(LazyElement, meta)
  }
}
