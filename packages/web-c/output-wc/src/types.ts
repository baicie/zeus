import type { DtsMode } from '@zeus-js/bundler-plugin'

export type WebCRegisterMode = 'lazy' | 'side-effect'

export type WebCWrapperMode = 'minimal' | 'event-bridge'

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
   * @default true
   */
  dts?: DtsMode

  /**
   * Generate JSX IntrinsicElements d.ts.
   *
   * @default true
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

  /**
   * lazy:
   *   Default. Generates Stencil-style lazy loader.
   *   On startup, registers lightweight ProxyClass; loads real component entry
   *   only when the element is connected to the DOM.
   *
   * side-effect:
   *   Immediately registers full components on import.
   *   Compatible with legacy behavior; not recommended as default.
   */
  register?: WebCRegisterMode

  /**
   * Whether to generate the auto.js entry (lazy mode).
   *
   * @default true
   */
  auto?: boolean

  /**
   * File name for lazy mode entry chunks.
   * Receives the tag name, should return the file name (without .js).
   *
   * @default (tag) => `${tag}.entry`
   */
  entryFileName?: (tag: string) => string
}
