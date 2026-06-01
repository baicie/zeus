import type { CompilerOptions } from '@zeus-js/compiler'
import type {
  AnalyzerDiagnostic,
  ComponentManifest,
} from '@zeus-js/component-analyzer'
import type { OutputBundle, PluginContext } from 'rollup'

export type MaybePromise<T> = T | Promise<T>

export type RootOption = string | (() => string)

// ---------------------------------------------------------------------------
// Output kinds
// ---------------------------------------------------------------------------

export type ZeusOutputKind =
  | 'wc'
  | 'react'
  | 'vue'
  | 'icons-react'
  | 'icons-vue'
  | 'icons-wc'
  | 'asset'

// ---------------------------------------------------------------------------
// dts
// ---------------------------------------------------------------------------

export type DtsMode = boolean | 'auto'

export interface ResolvedDts {
  enabled: boolean
  mode: DtsMode
  reason: DtsAutoReason[]
}

export type DtsAutoReason =
  | 'explicit-enabled'
  | 'explicit-disabled'
  | 'package-types-field'
  | 'typescript-dependency'
  | 'tsconfig'
  | 'typescript-source'

// ---------------------------------------------------------------------------
// Build context
// ---------------------------------------------------------------------------

export interface ZeusBuildContext {
  root: string
  manifest: ComponentManifest
  diagnostics: AnalyzerDiagnostic[]

  dts: ResolvedDts

  outputs: ZeusOutputRegistry

  emitFile: PluginContext['emitFile']
  warn: PluginContext['warn']
  error: PluginContext['error']
  addWatchFile: PluginContext['addWatchFile']

  meta: {
    watchMode: boolean
  }
}

// ---------------------------------------------------------------------------
// Output registry
// ---------------------------------------------------------------------------

export interface ZeusOutputRegistry {
  register(kind: ZeusOutputKind, options: ZeusOutputRegistration): void
  has(kind: ZeusOutputKind): boolean
  get(kind: ZeusOutputKind): RequiredZeusOutputRegistration
  getDir(kind: ZeusOutputKind): string
  getFileName(kind: ZeusOutputKind, tag: string): string
  join(kind: ZeusOutputKind, fileName: string): string
}

export interface ZeusOutputRegistration {
  outDir?: string
  stripPrefix?: string | false
  fileName?: (tag: string, kind: ZeusOutputKind) => string
}

export interface RequiredZeusOutputRegistration {
  outDir: string
  stripPrefix: string | false
  fileName?: (tag: string, kind: ZeusOutputKind) => string
}

// ---------------------------------------------------------------------------
// Plugin / output types
// ---------------------------------------------------------------------------

export interface ZeusVirtualModule {
  id: string
  code: string
  fileName?: string
}

export interface ZeusOutputAsset {
  type: 'asset'
  fileName: string
  source: string | Uint8Array
}

export interface ZeusOutputChunk {
  type: 'chunk'
  id: string
  fileName?: string
}

export type ZeusOutputFile = ZeusOutputAsset | ZeusOutputChunk

export interface ZeusComponentPlugin {
  name: string

  /**
   * Register output dirs / externals / plugin metadata.
   *
   * This hook runs before virtualModules().
   */
  setup?(ctx: ZeusBuildContext): void | Promise<void>

  buildStart?(ctx: ZeusBuildContext): MaybePromise<void>

  virtualModules?(
    ctx: ZeusBuildContext,
  ): MaybePromise<ZeusVirtualModule[] | void>

  generateBundle?(
    ctx: ZeusBuildContext,
    bundle: OutputBundle,
  ): MaybePromise<ZeusOutputFile[] | void>

  /**
   * Vite adapter can use this to auto externalize framework deps.
   */
  external?: string[]
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ZeusBundlerPluginOptions {
  /**
   * Project root.
   *
   * @default
   * - Vite: resolved config.root
   * - Rollup/Rolldown: process.cwd()
   */
  root?: RootOption

  /**
   * Component source scan options.
   * See DEFAULT_COMPONENT_INCLUDE and DEFAULT_COMPONENT_EXCLUDE in defaults.ts.
   */
  components?: {
    include?: string[]
    exclude?: string[]
  }

  /**
   * Declaration generation mode.
   *
   * @default 'auto'
   */
  dts?: DtsMode

  /**
   * Compiler options.
   */
  compiler?: Partial<CompilerOptions>

  /**
   * Print analyzer diagnostics.
   *
   * @default true
   */
  diagnostics?: boolean | 'verbose'

  /**
   * Component-host plugins.
   */
  plugins?: ZeusComponentPlugin[]
}
