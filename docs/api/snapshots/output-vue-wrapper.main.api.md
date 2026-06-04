# @zeus-js/output-vue-wrapper (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

type VueWrapperMode = 'minimal' | 'event-bridge'
export interface OutputVueWrapperOptions {
  /**
   * Vue wrapper output directory.
   *
   * @default 'vue'
   */
  outDir?: string
  /**
   * Strip tag prefix for file name.
   *
   * @default false
   */
  stripPrefix?: string | false
  /**
   * Custom file name.
   */
  fileName?: (tag: string) => string
  /**
   * Generate vue/index.d.ts.
   *
   * @default 'auto'
   */
  dts?: DtsMode
  /**
   * Generate vue/global.d.ts.
   *
   * @default 'auto'
   */
  globalDts?: DtsMode
  /**
   * Generate vue/index.js.
   *
   * @default true
   */
  index?: boolean
  /**
   * minimal:
   *   Default. Vue wrapper only renders the custom element tag.
   *   No watch, no prop sync, no event listeners.
   *
   * event-bridge:
   *   Additional mode for React CustomEvent bridging.
   */
  wrapper?: VueWrapperMode
}

export declare function vueWrapper(
  options?: OutputVueWrapperOptions,
): ZeusComponentPlugin

export { vueWrapper as default }
```
