# @zeus-js/vite-plugin (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { CompilerOptions } from '@zeus-js/compiler'
import { Plugin } from 'vite'

export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  compiler?: Partial<CompilerOptions>
  diagnostics?: boolean
}
export declare function createZeus(options?: ZeusVitePluginOptions): Plugin

export { createZeus as default, createZeus as zeus }
```
