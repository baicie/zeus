# @zeus-js/bundler-plugin (./vite) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { CompilerOptions } from '@zeus-js/compiler'
import {
  ComponentManifest,
  AnalyzerDiagnostic,
} from '@zeus-js/component-analyzer'
import { PluginContext, OutputBundle, ExternalOption } from 'rollup'
import { Plugin } from 'vite'

type MaybePromise<T> = T | Promise<T>
type RollupExternalOption = ExternalOption
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
  emitFile: PluginContext['emitFile']
  warn: PluginContext['warn']
  error: PluginContext['error']
  addWatchFile: PluginContext['addWatchFile']
  meta: {
    watchMode: boolean
  }
}
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
    bundle: OutputBundle,
  ): MaybePromise<ZeusOutputFile[] | void>
  /**
   * Vite adapter can use this to auto externalize framework deps.
   */
  external?: string[]
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

export declare function createZeusVitePlugin(
  options?: ZeusBundlerPluginOptions,
): Plugin

export declare function mergeExternal(
  userExternal: RollupExternalOption | undefined,
  pluginExternal: string[],
): RollupExternalOption

export { createZeusVitePlugin as default, createZeusVitePlugin as zeus }
```
