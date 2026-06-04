# @zeus-js/bundler-plugin (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { CompilerOptions } from '@zeus-js/compiler'
import {
  ComponentManifest,
  AnalyzerDiagnostic,
} from '@zeus-js/component-analyzer'
import { Plugin } from 'rollup'

type MaybePromise<T> = T | Promise<T>
export type RollupExternalOption =
  | string
  | RegExp
  | Array<string | RegExp>
  | ((
      source: string,
      importer: string | undefined,
      isResolved: boolean,
    ) => boolean)
type RootOption = string | (() => string)
export type ZeusOutputKind =
  | 'wc'
  | 'react'
  | 'vue'
  | 'icons-react'
  | 'icons-vue'
  | 'icons-wc'
  | 'asset'
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
export interface ZeusBuildContext {
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
    bundle: ZeusOutputBundle,
  ): MaybePromise<ZeusOutputFile[] | void>
  /**
   * Framework dependencies that bundler config helpers should externalize.
   *
   * Used by the Vite adapter, defineZeusRollupConfig(), and
   * defineZeusRolldownConfig().
   */
  external?: string[]
}
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
   * Rollup adapter only. Additional extensions to try when resolving imports.
   * Set to `false` to disable extension resolution.
   *
   * @default ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
   */
  resolveExtensions?: string[] | false
}

export declare function zeus(options?: ZeusBundlerPluginOptions): Plugin

export declare function createOutputRegistry(): ZeusOutputRegistry

export declare function resolveComponentInclude(include?: string[]): string[]
export declare function resolveComponentExclude(exclude?: string[]): string[]

export declare function resolvePluginDts(
  value: DtsMode | undefined,
  ctx: ZeusBuildContext,
): boolean

export declare function mergeExternal(
  userExternal: RollupExternalOption | undefined,
  pluginExternal: string[],
): RollupExternalOption

export { zeus as default }
```
