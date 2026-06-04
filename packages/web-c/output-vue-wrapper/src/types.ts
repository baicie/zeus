import type { DtsMode } from '@zeus-js/bundler-plugin'

export type VueWrapperMode = 'minimal' | 'event-bridge'

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
   * minimal:
   *   Default. Vue wrapper only renders the custom element tag.
   *   No watch, no prop sync, no event listeners.
   *
   * event-bridge:
   *   Additional mode for React CustomEvent bridging.
   */
  wrapper?: VueWrapperMode
}
