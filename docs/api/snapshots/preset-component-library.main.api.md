# @zeus-js/preset-component-library (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

export interface ComponentLibraryPresetOptions {
  styles?: string | false
  targets?: ComponentLibraryTarget[]
  dts?: DtsMode
  jsxDts?: DtsMode
  manifest?: boolean
  customElements?: boolean
}
export type ComponentLibraryTarget = 'wc' | 'react' | 'vue'
export declare function componentLibrary(
  options?: ComponentLibraryPresetOptions,
): ZeusComponentPlugin[]
export { default as css } from '@zeus-js/output-css'
export { default as react } from '@zeus-js/output-react-wrapper'
export { default as vue } from '@zeus-js/output-vue-wrapper'
export { default as wc } from '@zeus-js/output-wc'
```
