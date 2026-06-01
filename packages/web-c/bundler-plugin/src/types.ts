import type { CompilerOptions } from '@zeus-js/compiler'
import type {
  AnalyzerDiagnostic,
  ComponentManifest,
} from '@zeus-js/component-analyzer'
import type { PluginContext, OutputBundle } from 'rollup'

export type MaybePromise<T> = T | Promise<T>

export type RootOption = string | (() => string)

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
   * Output plugins.
   */
  outputs?: ZeusOutputPlugin[]

  /**
   * Emit manifest diagnostics as warnings.
   */
  diagnostics?: boolean
}

export interface ZeusBuildContext {
  root: string
  manifest: ComponentManifest
  diagnostics: AnalyzerDiagnostic[]

  emitFile: PluginContext['emitFile']
  warn: PluginContext['warn']
  error: PluginContext['error']
  addWatchFile: PluginContext['addWatchFile']

  meta: {
    watchMode: boolean
  }
}

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
  source: string
}

export interface ZeusOutputChunk {
  type: 'chunk'
  id: string
  fileName?: string
}

export type ZeusOutputFile = ZeusOutputAsset | ZeusOutputChunk

export interface ZeusOutputPlugin {
  name: string

  buildStart?: (ctx: ZeusBuildContext) => MaybePromise<void>

  virtualModules?: (
    ctx: ZeusBuildContext,
  ) => MaybePromise<ZeusVirtualModule[] | void>

  generateBundle?: (
    ctx: ZeusBuildContext,
    bundle: OutputBundle,
  ) => MaybePromise<ZeusOutputFile[] | void>
}
