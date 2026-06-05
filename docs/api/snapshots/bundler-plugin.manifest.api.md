# @zeus-js/bundler-plugin (./manifest) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import {
  ComponentManifest,
  AnalyzerDiagnostic,
} from '@zeus-js/component-analyzer'

type MaybePromise<T> = T | Promise<T>
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

export interface ManifestOutputOptions {
  fileName?: string
  pretty?: boolean
}
export declare function manifestOutput(
  options?: ManifestOutputOptions,
): ZeusComponentPlugin

export { manifestOutput as default }
```
