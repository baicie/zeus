# @zeus-js/output-vue-wrapper (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'
import * as vue from 'vue'

type VueWrapperMode = 'runtime' | 'minimal' | 'event-bridge'
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
   * @default true
   */
  dts?: DtsMode
  /**
   * Generate vue/global.d.ts.
   *
   * @default true
   */
  globalDts?: DtsMode
  /**
   * Generate vue/index.js.
   *
   * @default true
   */
  index?: boolean
  /**
   * runtime:
   *   Default. Generates thin proxies powered by @zeus-js/output-vue-wrapper/runtime.
   *   No watch, no onMounted, no addEventListener — Vue-native props/events/model/slots.
   *
   * minimal:
   *   Vue wrapper only renders the custom element tag.
   *   No watch, no prop sync, no event listeners.
   *
   * event-bridge:
   *   Additional mode with explicit prop syncing and CustomEvent bridging.
   */
  wrapper?: VueWrapperMode
}

export interface ZeusVueModelOptions {
  prop: string
  event: string | string[]
  eventPath?: string
}
export interface ZeusVueContainerOptions {
  tagName: string
  displayName?: string
  defineCustomElement?: () => void
  props?: string[]
  events?: string[]
  slots?: string[]
  model?: ZeusVueModelOptions
  transformTag?: (tagName: string) => string
}
export declare function defineContainer(
  options: ZeusVueContainerOptions,
): vue.DefineSetupFnComponent<
  {
    [x: string]: /*elided*/ any
  },
  string[],
  {},
  {
    [x: string]: /*elided*/ any
  } & {
    [x: `on${Capitalize<string>}`]: ((...args: any[]) => any) | undefined
  },
  vue.PublicProps
>

export declare function vueWrapper(
  options?: OutputVueWrapperOptions,
): ZeusComponentPlugin

export { vueWrapper as default }
```
