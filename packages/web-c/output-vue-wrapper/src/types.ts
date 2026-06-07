import type { DtsMode } from '@zeus-js/bundler-plugin'

export type VueWrapperMode = 'runtime' | 'minimal' | 'event-bridge'

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
