// packages/web-c-runtime/src/bootstrapLazy.ts

import { createLazyElementClass } from './lazy-element'

import type { BootstrapLazyOptions, ZeusLazyComponentMeta } from './types'

const ZEUS_LAZY_MANAGED_TAGS = Symbol.for('zeus.web-c.lazy-managed-tags')

function getLazyManagedTags(): Set<string> {
  const globalObject = globalThis as typeof globalThis & {
    [ZEUS_LAZY_MANAGED_TAGS]?: Set<string>
  }

  globalObject[ZEUS_LAZY_MANAGED_TAGS] ??= new Set<string>()

  return globalObject[ZEUS_LAZY_MANAGED_TAGS]
}

export function bootstrapLazy(
  components: ZeusLazyComponentMeta[],
  options: BootstrapLazyOptions = {},
): void {
  const registry =
    options.registry ??
    (typeof customElements !== 'undefined' ? customElements : undefined)

  if (!registry) {
    return
  }

  const managedTags = getLazyManagedTags()

  for (const meta of components) {
    managedTags.add(meta.tagName)
  }

  for (const meta of components) {
    if (registry.get(meta.tagName)) {
      continue
    }

    const LazyElement = createLazyElementClass(meta)

    registry.define(meta.tagName, LazyElement)
  }
}
