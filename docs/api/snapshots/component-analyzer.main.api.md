# @zeus-js/component-analyzer (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
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
  props: Record<string, ComponentProp>
  events: Record<string, ComponentEvent>
  slots: Record<string, ComponentSlot>
  hostAttributes: string[]
  cssParts: string[]
  cssVars: string[]
  description?: string
  meta?: Record<string, unknown>
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

export declare function analyzeFile(
  options: AnalyzeFileOptions,
): AnalyzeFileResult

export declare function analyzeComponents(
  options: AnalyzeComponentsOptions,
): Promise<AnalyzeComponentsResult>
```
