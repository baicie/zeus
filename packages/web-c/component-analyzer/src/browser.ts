/**
 * Browser-safe analyzer surface.
 *
 * This entry deliberately excludes filesystem-backed project discovery so the
 * Playground can reuse the exact production AST analysis without bundling
 * Node built-ins.
 */
export { analyzeFile } from './analyzeFile'
export { PORTABLE_GLOBAL_TYPE_REFERENCES } from './portable-types'
export {
  getComponentAttributeName,
  getComponentEventName,
  isAttributeBackedPropType,
  isValidComponentEventName,
} from './abi'
export type {
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
