export interface OutputVueWrapperOptions {
  /**
   * Output directory.
   *
   * @default 'vue'
   */
  outDir?: string

  /**
   * Relative path from vue output files to wc output dir.
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
   * Whether to emit global.d.ts.
   *
   * @default true
   */
  globalDts?: boolean

  stripPrefix?: string | false

  fileName?: (tag: string) => string
}
