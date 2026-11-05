# @zeus-js/vite-plugin (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { Plugin } from 'vite'

type CompilerCacheEventType = 'hit' | 'miss' | 'invalidate' | 'skip'
type CompilerCacheMissReason = 'cold' | 'source-changed' | 'cache-disabled'
type CompilerCacheHitReason = 'cached'
type CompilerCacheInvalidateReason = 'hot-update' | 'manual'
export interface CompilerCacheEvent {
  readonly type: CompilerCacheEventType
  readonly filename: string
  readonly target: 'dom' | 'ssr'
  readonly reason:
    | CompilerCacheHitReason
    | CompilerCacheMissReason
    | CompilerCacheInvalidateReason
  readonly key?: string
}
export interface CompilerCacheOptions {
  readonly enabled?: boolean
  readonly onEvent?: (event: CompilerCacheEvent) => void
}

export interface ZeusNativeCompilerOptions {
  moduleName?: string
  delegateEvents?: boolean
  /**
   * Cache native compiler results per plugin instance. Pass an observer to
   * collect hit/miss/invalidation events, or false to disable the cache.
   */
  cache?: boolean | CompilerCacheOptions
}
export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  /** Automatic render-root boundaries. Literal binding patches are opt-in. */
  hmr?:
    | boolean
    | {
        preserveBindings?: boolean
      }
  /** Runtime module used by Vite SSR transforms. */
  ssrModuleName?: string
  compiler?: ZeusNativeCompilerOptions
}
export declare function createZeus(options?: ZeusVitePluginOptions): Plugin

export { createZeus as default, createZeus as zeus }
```
