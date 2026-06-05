# @zeus-js/bundler-plugin (./rolldown) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { CompilerOptions } from '@zeus-js/compiler'
import {
  ComponentManifest,
  AnalyzerDiagnostic,
} from '@zeus-js/component-analyzer'
import { RolldownOptions, Plugin } from 'rolldown'

type MaybePromise<T> = T | Promise<T>
type RootOption = string | (() => string)
type ZeusOutputKind =
  | 'wc'
  | 'react'
  | 'vue'
  | 'icons-react'
  | 'icons-vue'
  | 'icons-wc'
  | 'asset'
type DtsMode = boolean | 'auto'
interface ResolvedDts {
  enabled: boolean
  mode: DtsMode
  reason: DtsAutoReason[]
}
type DtsAutoReason =
  | 'explicit-enabled'
  | 'explicit-disabled'
  | 'package-types-field'
  | 'typescript-dependency'
  | 'tsconfig'
  | 'typescript-source'
interface ZeusBuildContext {
  root: string
  manifest: ComponentManifest
  diagnostics: AnalyzerDiagnostic[]
  dts: ResolvedDts
  outputs: ZeusOutputRegistry
  emitFile: (file: unknown) => string | void
  warn: (message: string | Error) => void
  error: (message: string | Error) => never
  addWatchFile: (id: string) => void
  meta: {
    watchMode: boolean
  }
}
type ZeusOutputBundle = Record<string, unknown>
interface ZeusOutputRegistry {
  register(kind: ZeusOutputKind, options: ZeusOutputRegistration): void
  has(kind: ZeusOutputKind): boolean
  get(kind: ZeusOutputKind): RequiredZeusOutputRegistration
  getDir(kind: ZeusOutputKind): string
  getFileName(kind: ZeusOutputKind, tag: string): string
  join(kind: ZeusOutputKind, fileName: string): string
}
interface ZeusOutputRegistration {
  outDir?: string
  stripPrefix?: string | false
  fileName?: (tag: string, kind: ZeusOutputKind) => string
}
interface RequiredZeusOutputRegistration {
  outDir: string
  stripPrefix: string | false
  fileName?: (tag: string, kind: ZeusOutputKind) => string
}
interface ZeusVirtualModule {
  id: string
  code: string
  fileName?: string
}
interface ZeusOutputAsset {
  type: 'asset'
  fileName: string
  source: string | Uint8Array
}
interface ZeusOutputChunk {
  type: 'chunk'
  id: string
  fileName?: string
}
type ZeusOutputFile = ZeusOutputAsset | ZeusOutputChunk
interface ZeusComponentPlugin {
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
    bundle: ZeusOutputBundle,
  ): MaybePromise<ZeusOutputFile[] | void>
  /**
   * Framework dependencies that bundler config helpers should externalize.
   *
   * Used by the Vite adapter, defineZeusRollupConfig(), and
   * defineZeusRolldownConfig().
   */
  external?: Array<string | RegExp>
}
interface ZeusBundlerPluginOptions {
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
   * Zeus JSX compile transform filter.
   *
   * This is intentionally separate from `components`: files can be excluded
   * from component analysis / manifest generation while still compiling JSX.
   */
  transform?: {
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
  /**
   * Enable TypeScript transpilation via Babel preset-typescript.
   *
   * @default
   * - rollup: true
   * - rolldown: false
   * - vite: false
   */
  transpile?: boolean
  /**
   * Clean the resolved Rollup/Rolldown output directory before writing.
   *
   * Vite keeps using its own emptyOutDir behavior.
   *
   * @default true
   */
  clean?: boolean
  /**
   * Rollup adapter only. Additional extensions to try when resolving imports.
   * Set to `false` to disable extension resolution.
   *
   * @default ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
   */
  resolveExtensions?: string[] | false
}

export declare function zeus(options?: ZeusBundlerPluginOptions): Plugin

export interface ZeusRolldownConfigOptions extends Omit<
  RolldownOptions,
  'plugins'
> {
  zeus?: ZeusBundlerPluginOptions
  plugins?: RolldownOptions['plugins']
}
export declare function defineZeusRolldownConfig(
  config?: ZeusRolldownConfigOptions,
): RolldownOptions

export { zeus as default }
```
