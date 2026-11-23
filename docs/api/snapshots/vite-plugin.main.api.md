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
   * Emit the hydration root markers and the adoption call for each component.
   *
   * Off in the compiler itself (`auto_hydrate.unwrap_or(false)`) because a
   * purely client-rendered app pays for markers it never reads. A Vite app that
   * wants to hydrate server markup has to turn it on, and until this option
   * existed there was no way to: the plugin never passed the flag, so *every*
   * Vite consumer compiled without markers and `render(..., { hydrate: true })`
   * failed with `ZEUS_HYDRATION_NO_ADOPTION` on markup the same source had just
   * produced for SSR.
   *
   * Both environments must agree — the server emits the markers the client
   * looks for — so this one option drives both the client and the SSR
   * transform rather than exposing a per-target switch that could be set
   * inconsistently.
   */
  autoHydrate?: boolean
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
