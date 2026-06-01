export interface OutputReactWrapperOptions {
  /**
   * Output directory.
   *
   * @default 'react'
   */
  outDir?: string

  /**
   * Relative path from react output files to wc output dir.
   *
   * Example:
   *   react/z-button.js -> ../wc/z-button.js
   *
   * @default '../wc'
   */
  wcOutDir?: string

  /**
   * Whether to emit index.js.
   *
   * @default true
   */
  index?: boolean

  /**
   * Whether to emit index.d.ts.
   *
   * @default true
   */
  dts?: boolean

  /**
   * Whether to strip tag prefix when generating file names.
   */
  stripPrefix?: string | false

  /**
   * Custom file name.
   */
  fileName?: (tag: string) => string

  /**
   * Named slot mapping strategy.
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
