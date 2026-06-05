export { default, zeus } from './rollup'

export { createZeusVitePlugin } from './vite'
export {
  defineZeusRollupConfig,
  zeus as createZeusRollupPlugin,
} from './rollup'
export {
  defineZeusRolldownConfig,
  zeus as createZeusRolldownPlugin,
} from './rolldown'

export { createOutputRegistry } from './outputRegistry'

export { resolveComponentInclude, resolveComponentExclude } from './defaults'

export { resolvePluginDts } from './pluginOptions'

export { mergeExternal } from './external'

export type {
  DtsMode,
  ResolvedDts,
  DtsAutoReason,
  RollupExternalOption,
  ZeusBuildContext,
  ZeusBundlerPluginOptions,
  ZeusOutputAsset,
  ZeusOutputChunk,
  ZeusOutputFile,
  ZeusComponentPlugin,
  ZeusVirtualModule,
  ZeusOutputKind,
  ZeusOutputRegistry,
  ZeusOutputRegistration,
  RequiredZeusOutputRegistration,
} from './types'

export type { ZeusRollupConfigOptions } from './rollup'
export type { ZeusRolldownConfigOptions } from './rolldown'
