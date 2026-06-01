import type { CompilerOptions } from '@zeus-js/compiler'
import type {
  AnalyzerDiagnostic,
  ComponentManifest,
} from '@zeus-js/component-analyzer'
import type { PluginContext, OutputBundle } from 'rollup'

export type MaybePromise<T> = T | Promise<T>

export type RootOption = string | (() => string)

// ---------------------------------------------------------------------------
// Output kinds
// ---------------------------------------------------------------------------

export type ZeusComponentOutputKind =
  | 'wc'
  | 'react'
  | 'vue'
  | 'icons-react'
  | 'icons-vue'
  | 'icons-wc'
  | 'asset'

// ---------------------------------------------------------------------------
// Shared output configuration
// ---------------------------------------------------------------------------

export interface ZeusComponentOutputConfig {
  /**
   * Root output dir inside bundler output dir.
   *
   * Usually empty. Keep each plugin using wc/react/vue.
   */
  outDir?: string

  /**
   * Directory for Web Component output.
   *
   * @default 'wc'
   */
  wcDir?: string

  /**
   * Directory for React wrapper output.
   *
   * @default 'react'
   */
  reactDir?: string

  /**
   * Directory for Vue wrapper output.
   *
   * @default 'vue'
   */
  vueDir?: string

  /**
   * Directory for icons output.
   *
   * @default 'icons'
   */
  iconsDir?: string

  /**
   * Shared filename naming rule.
   */
  fileName?: (tag: string, kind: ZeusComponentOutputKind) => string

  /**
   * Shared stripPrefix rule.
   */
  stripPrefix?: string | false

  /**
   * Shared dts switch.
   */
  dts?: boolean
}

export interface RequiredZeusComponentOutputConfig {
  outDir: string
  wcDir: string
  reactDir: string
  vueDir: string
  iconsDir: string
  stripPrefix: string | false
  dts: boolean
  fileName?: (tag: string, kind: ZeusComponentOutputKind) => string
}

// ---------------------------------------------------------------------------
// Path resolver
// ---------------------------------------------------------------------------

export interface ZeusOutputPathResolver {
  getFileName(tag: string, kind: ZeusComponentOutputKind): string

  getDir(kind: ZeusComponentOutputKind): string

  join(kind: ZeusComponentOutputKind, fileName: string): string

  relativeImport(
    from: ZeusComponentOutputKind,
    to: ZeusComponentOutputKind,
    tag: string,
  ): string
}

// ---------------------------------------------------------------------------
// Build context
// ---------------------------------------------------------------------------

export interface ZeusBuildContext {
  root: string
  manifest: ComponentManifest
  diagnostics: AnalyzerDiagnostic[]

  output: RequiredZeusComponentOutputConfig
  paths: ZeusOutputPathResolver

  emitFile: PluginContext['emitFile']
  warn: PluginContext['warn']
  error: PluginContext['error']
  addWatchFile: PluginContext['addWatchFile']

  meta: {
    watchMode: boolean
  }
}

// ---------------------------------------------------------------------------
// Plugin / output types
// ---------------------------------------------------------------------------

export interface ZeusVirtualModule {
  /**
   * Public virtual id.
   * Example: zeus:wc:index
   */
  id: string

  /**
   * Output fileName when emitted as a chunk.
   */
  fileName?: string

  /**
   * Virtual module code.
   */
  code: string
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

  buildStart?(ctx: ZeusBuildContext): MaybePromise<void>

  virtualModules?(
    ctx: ZeusBuildContext,
  ): MaybePromise<ZeusVirtualModule[] | void>

  generateBundle?(
    ctx: ZeusBuildContext,
    bundle: OutputBundle,
  ): MaybePromise<ZeusOutputFile[] | void>
}

/**
 * @deprecated Use `ZeusComponentPlugin` instead.
 */
export type ZeusOutputPlugin = ZeusComponentPlugin

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ZeusBundlerPluginOptions {
  /**
   * Source files to transform with @zeus-js/compiler.
   */
  include?: RegExp | RegExp[]

  /**
   * Source files to skip.
   */
  exclude?: RegExp | RegExp[]

  /**
   * Root directory for component analyzer.
   */
  root?: RootOption

  /**
   * Compiler options.
   */
  compiler?: Partial<CompilerOptions>

  /**
   * Component analyzer options.
   */
  components?: {
    include?: string[]
    exclude?: string[]
  }

  /**
   * New preferred API.
   */
  plugins?: ZeusComponentPlugin[]

  /**
   * Backward compatibility.
   *
   * @deprecated Use `plugins` instead.
   */
  outputs?: ZeusComponentPlugin[]

  /**
   * Shared output config for all component plugins.
   */
  output?: ZeusComponentOutputConfig

  /**
   * Emit manifest diagnostics as warnings.
   */
  diagnostics?: boolean
}

export interface ZeusComponentHostConfig {
  root?: RootOption
  components?: ZeusBundlerPluginOptions['components']
  compiler?: ZeusBundlerPluginOptions['compiler']
  diagnostics?: boolean
  output?: ZeusComponentOutputConfig
  plugins: ZeusComponentPlugin[]
}
