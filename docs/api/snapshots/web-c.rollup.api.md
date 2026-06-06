# @zeus-js/web-c (./rollup) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import {
  DtsMode,
  ZeusComponentPlugin,
  createZeusRollupPlugin,
} from '@zeus-js/bundler-plugin'
export {
  ZeusBundlerPluginOptions,
  ZeusComponentPlugin,
  ZeusOutputRegistry,
  ZeusRollupConfigOptions,
  createOutputRegistry,
  createZeusRollupPlugin as default,
  defineZeusRollupConfig,
  resolvePluginDts,
  createZeusRollupPlugin as zeus,
} from '@zeus-js/bundler-plugin'
export {
  AnalyzeComponentsOptions,
  AnalyzeComponentsResult,
  AnalyzeFileOptions,
  AnalyzeFileResult,
  ComponentManifest,
  ComponentRecord,
  analyzeComponents,
  analyzeFile,
} from '@zeus-js/component-analyzer'
export {
  ComponentDtsOptions,
  DtsOutputFile,
  generateReactDts,
  generateVueDts,
  generateWCDtsFiles,
  generateWCJsxDts,
} from '@zeus-js/component-dts'
export { OutputCssOptions, default as css } from '@zeus-js/output-css'
export { OutputIconsOptions, default as icons } from '@zeus-js/output-icons'
export {
  OutputReactWrapperOptions,
  default as react,
} from '@zeus-js/output-react-wrapper'
export {
  OutputVueWrapperOptions,
  default as vue,
} from '@zeus-js/output-vue-wrapper'
export { OutputWCOptions, default as wc } from '@zeus-js/output-wc'

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
   * Whether to generate the auto.js entry (lazy mode).
   *
   * @default true
   */
  autoEntry?: boolean
  /**
   * Vue / React wrapper mode.
   *
   * minimal:
   *   Only renders the custom element tag. No watch/sync/event bridge.
   *
   * event-bridge:
   *   Default. Adds prop sync and event listeners for declared component events.
   */
  wrapper?: WebCWrapperMode
}
export type ComponentLibraryTarget = 'wc' | 'react' | 'vue'
export declare function componentLibrary(
  options?: ComponentLibraryPresetOptions,
): ZeusComponentPlugin[]
```
