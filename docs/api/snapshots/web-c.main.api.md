# @zeus-js/web-c (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import {
  DtsMode,
  ZeusComponentPlugin,
  createOutputRegistry,
  resolvePluginDts,
} from '@zeus-js/bundler-plugin'
export {
  ZeusBundlerPluginOptions,
  ZeusComponentPlugin,
  ZeusOutputRegistry,
  createOutputRegistry,
  resolvePluginDts,
} from '@zeus-js/bundler-plugin'
import { analyzeComponents, analyzeFile } from '@zeus-js/component-analyzer'
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
import {
  generateReactDts,
  generateVueDts,
  generateWCDtsFiles,
  generateWCJsxDts,
} from '@zeus-js/component-dts'
export {
  ComponentDtsOptions,
  DtsOutputFile,
  generateReactDts,
  generateVueDts,
  generateWCDtsFiles,
  generateWCJsxDts,
} from '@zeus-js/component-dts'
import css from '@zeus-js/output-css'
export { OutputCssOptions, default as css } from '@zeus-js/output-css'
import icons from '@zeus-js/output-icons'
export { OutputIconsOptions, default as icons } from '@zeus-js/output-icons'
import react from '@zeus-js/output-react-wrapper'
export {
  OutputReactWrapperOptions,
  default as react,
} from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
export {
  OutputVueWrapperOptions,
  default as vue,
} from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'
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

declare const _default: {
  analyzeComponents: typeof analyzeComponents
  analyzeFile: typeof analyzeFile
  componentLibrary: typeof componentLibrary
  createOutputRegistry: typeof createOutputRegistry
  css: typeof css
  generateReactDts: typeof generateReactDts
  generateVueDts: typeof generateVueDts
  generateWCDtsFiles: typeof generateWCDtsFiles
  generateWCJsxDts: typeof generateWCJsxDts
  icons: typeof icons
  react: typeof react
  resolvePluginDts: typeof resolvePluginDts
  vue: typeof vue
  wc: typeof wc
}

export { _default as default }
```
