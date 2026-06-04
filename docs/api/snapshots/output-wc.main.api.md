# @zeus-js/output-wc (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

type WebCRegisterMode = 'lazy' | 'side-effect'
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
   * Whether to generate the components.manifest.js file (lazy mode).
   *
   * @default true
   */
  manifest?: boolean
  /**
   * Whether to generate the loader.js file (lazy mode).
   *
   * @default true
   */
  loader?: boolean
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

export declare function wc(options?: OutputWCOptions): ZeusComponentPlugin

export { wc as default }
```
