export type ComponentPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'unknown'

export interface ComponentManifest {
  version: 1
  components: ComponentRecord[]
}

export interface ComponentRecord {
  tag: string
  name: string
  exportName: string
  source: string

  /**
   * Public props merged from runtime definitions, TypeScript types and metadata.
   * Used by declarations, documentation and framework wrapper types.
   */
  props: Record<string, ComponentProp>

  /**
   * Exact runtime props extracted from defineElement(options.props).
   * Lazy Proxy Elements must only consume this field.
   */
  runtimeProps?: Record<string, ComponentProp>

  /**
   * Validation messages explaining why runtime props could not be analyzed.
   */
  runtimePropsDiagnostics?: string[]

  events: Record<string, ComponentEvent>
  methods?: Record<string, ComponentMethod>
  slots: Record<string, ComponentSlot>

  hostAttributes: string[]
  cssParts: string[]
  cssVars: Record<string, ComponentCssVar>

  description?: string
  meta?: {
    shadow?: boolean
    formAssociated?: boolean
    [key: string]: unknown
  }
}

export interface ComponentProp {
  type: ComponentPropType
  required?: boolean
  values?: string[]
  default?: unknown
  reflect?: boolean
  attr?: string | false
  description?: string
}

export interface ComponentEvent {
  key?: string
  name?: string
  reactName?: string
  detail?: Record<string, string>
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
  description?: string
}

export interface ComponentMethod {
  name: string
  description?: string
}

export interface ComponentSlot {
  name?: string
  description?: string
}

export interface ComponentCssVar {
  name: string
  description?: string
}

export interface AnalyzeFileResult {
  file: string
  components: ComponentRecord[]
  diagnostics: AnalyzerDiagnostic[]
}

export interface AnalyzeComponentsResult {
  manifest: ComponentManifest
  diagnostics: AnalyzerDiagnostic[]
}

export interface AnalyzerDiagnostic {
  level: 'warning' | 'error'
  file: string
  message: string
}

export interface AnalyzeFileOptions {
  file: string
  code: string
}

export interface AnalyzeComponentsOptions {
  root?: string
  include: string[]
  exclude?: string[]
}
