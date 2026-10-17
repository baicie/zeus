// packages/web-c-runtime/src/index.ts

export { bootstrapLazy } from './bootstrapLazy'
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
