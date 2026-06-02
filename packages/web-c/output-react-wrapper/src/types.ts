import type { DtsMode } from '@zeus-js/bundler-plugin'

export interface OutputReactWrapperOptions {
  /**
   * React wrapper output directory.
   *
   * @default 'react'
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
   * Generate react/index.d.ts.
   *
   * @default 'auto'
   */
  dts?: DtsMode

  /**
   * Generate react/index.js.
   *
   * @default true
   */
  index?: boolean

  /**
   * Named slot strategy.
   *
   * props:
   *   <ZCard header={<div />} />
   *
   * none:
   *   only children/default slot
   *
   * @default 'props'
   */
  namedSlots?: 'props' | 'none'
}
