// packages/web-c-runtime/src/index.ts

export { bootstrapLazy } from './bootstrapLazy'
/**
 * Marker for the loader contract that generated `@zeus-js/output-wc` code
 * imports. Renamed, never redefined, when the contract changes incompatibly.
 */
export const ZEUS_WC_RUNTIME_ABI_1 = 1
export { createLazyElementClass } from './lazy-element'
export { resolveHostProperties } from './props'

export type { BootstrapLazyOptions } from './bootstrapLazy'

export type {
  HostRef,
  ZeusComponentInstance,
  ZeusComponentModule,
  ZeusLazyComponentMeta,
  ZeusPropMeta,
  ZeusPropType,
} from './types'
