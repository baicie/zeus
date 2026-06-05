import { createOutputRegistry, resolvePluginDts } from '@zeus-js/bundler-plugin'
import { analyzeComponents, analyzeFile } from '@zeus-js/component-analyzer'
import {
  generateReactDts,
  generateVueDts,
  generateWCDtsFiles,
  generateWCJsxDts,
} from '@zeus-js/component-dts'
import css from '@zeus-js/output-css'
import icons from '@zeus-js/output-icons'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'
import { componentLibrary } from '@zeus-js/preset-component-library'

export { componentLibrary }

export { css, icons, react, vue, wc }

export { analyzeComponents, analyzeFile }

export {
  generateReactDts,
  generateVueDts,
  generateWCDtsFiles,
  generateWCJsxDts,
}

export { createOutputRegistry, resolvePluginDts }

export type {
  ZeusBundlerPluginOptions,
  ZeusComponentPlugin,
  ZeusOutputRegistry,
} from '@zeus-js/bundler-plugin'
export type {
  AnalyzeComponentsOptions,
  AnalyzeComponentsResult,
  AnalyzeFileOptions,
  AnalyzeFileResult,
  ComponentManifest,
  ComponentRecord,
} from '@zeus-js/component-analyzer'
export type { ComponentDtsOptions, DtsOutputFile } from '@zeus-js/component-dts'
export type { OutputCssOptions } from '@zeus-js/output-css'
export type { OutputIconsOptions } from '@zeus-js/output-icons'
export type { OutputReactWrapperOptions } from '@zeus-js/output-react-wrapper'
export type { OutputVueWrapperOptions } from '@zeus-js/output-vue-wrapper'
export type { OutputWCOptions } from '@zeus-js/output-wc'
export type {
  ComponentLibraryPresetOptions,
  ComponentLibraryTarget,
  WebCRegisterMode,
  WebCWrapperMode,
} from '@zeus-js/preset-component-library'

export default {
  analyzeComponents,
  analyzeFile,
  componentLibrary,
  createOutputRegistry,
  css,
  generateReactDts,
  generateVueDts,
  generateWCDtsFiles,
  generateWCJsxDts,
  icons,
  react,
  resolvePluginDts,
  vue,
  wc,
}
