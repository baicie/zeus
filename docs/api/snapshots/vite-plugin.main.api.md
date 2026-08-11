# @zeus-js/vite-plugin (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { Plugin } from 'vite'

export interface ZeusNativeCompilerOptions {
  moduleName?: string
  delegateEvents?: boolean
}
export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  /** Inject dispose-and-remount boundaries for top-level render roots. */
  hmr?: boolean
  /** Runtime module used by Vite SSR transforms. */
  ssrModuleName?: string
  compiler?: ZeusNativeCompilerOptions
}
export declare function createZeus(options?: ZeusVitePluginOptions): Plugin

export { createZeus as default, createZeus as zeus }
```
