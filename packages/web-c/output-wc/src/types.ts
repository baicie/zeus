import type { DtsMode } from '@zeus-js/bundler-plugin'

export interface OutputWCOptions {
  /**
   * Web Component output directory.
   *
   * @default 'wc'
   */
  outDir?: string

  /**
   * Strip tag prefix for file name.
   *
   * Example:
   * z-button -> button.js
   *
   * @default false
   */
  stripPrefix?: string | false

  /**
   * Custom file name.
   */
  fileName?: (tag: string) => string

  /**
   * Component manifest file.
   *
   * @default 'zeus.components.json'
   */
  manifestFile?: string | false

  /**
   * Custom Elements Manifest file.
   *
   * @default 'custom-elements.json'
   */
  customElementsFile?: string | false

  /**
   * Generate WC d.ts.
   *
   * @default 'auto'
   */
  dts?: DtsMode

  /**
   * Generate JSX IntrinsicElements d.ts.
   *
   * @default 'auto'
   */
  jsxDts?: DtsMode

  /**
   * Generate wc/index.js.
   *
   * @default true
   */
  index?: boolean

  /**
   * Whether to warn when two components map to the same file name.
   *
   * @default true
   */
  warnOnFileNameCollision?: boolean
}
