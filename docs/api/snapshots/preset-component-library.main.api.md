# @zeus-js/preset-component-library (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export { default as css } from '@zeus-js/output-css'
export { default as react } from '@zeus-js/output-react-wrapper'
export { default as vue } from '@zeus-js/output-vue-wrapper'
export { default as wc } from '@zeus-js/output-wc'
import { DtsMode, ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

export type WebCRegisterMode = 'lazy' | 'side-effect'
export type WebCWrapperMode = 'minimal' | 'event-bridge'
export interface ComponentLibraryPresetOptions {
  styles?: string | false
  targets?: ComponentLibraryTarget[]
  /**
   * Generate .d.ts declaration files.
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
  manifest?: boolean
  customElements?: boolean
  /**
   * lazy:
   *   Default. Stencil-style lazy loader.
   *   Registers lightweight ProxyClass on startup; loads real component
   *   entry only on element connectedCallback.
   *
   * side-effect:
   *   Immediately registers full components on import.
   */
  register?: WebCRegisterMode
  /**
   * Whether to generate the components.manifest.js file (lazy mode).
   *
   * @default true
   */
  manifestFile?: boolean
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
  autoEntry?: boolean
  /**
   * Vue / React wrapper mode.
   *
   * minimal:
   *   Default. Only renders the custom element tag. No watch/sync/event bridge.
   *
   * event-bridge:
   *   Additional mode with prop sync and event listeners.
   */
  wrapper?: WebCWrapperMode
}
export type ComponentLibraryTarget = 'wc' | 'react' | 'vue'
export declare function componentLibrary(
  options?: ComponentLibraryPresetOptions,
): ZeusComponentPlugin[]
```
