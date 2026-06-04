export type ComponentPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
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
  slots: Record<string, ComponentSlot>

  hostAttributes: string[]
  cssParts: string[]
  cssVars: string[]

  description?: string
  meta?: {
    shadow?: boolean
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
  detail?: Record<string, string>
  description?: string
}

export interface ComponentSlot {
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
