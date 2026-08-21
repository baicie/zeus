export { analyzeFile } from './analyzeFile'
export { analyzeComponents } from './analyzeComponents'
/** @internal */
export { analyzeComponentsWithDependencies } from './analyzeComponents'
export { PORTABLE_GLOBAL_TYPE_REFERENCES } from './portable-types'

export type {
  AnalyzeComponentsOptions,
  AnalyzeComponentsResult,
  AnalyzeFileOptions,
  AnalyzeFileResult,
  AnalyzerDiagnostic,
  ComponentEvent,
  ComponentManifest,
  ComponentMethod,
  ComponentMethodParameter,
  ComponentModel,
  ComponentProp,
  ComponentPropDeclaration,
  ComponentPropType,
  ComponentRecord,
  ComponentCssVar,
  ComponentSlot,
} from './types'
export type { PortableGlobalTypeReference } from './portable-types'
