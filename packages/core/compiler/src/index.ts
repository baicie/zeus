import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export interface CompilerDiagnostic {
  code: string
  message: string
  severity: 'error' | 'warning'
  filename: string
  hint?: string
  span?: SourceSpan
}

export interface SourcePosition {
  offset: number
  line: number
  column: number
}

export interface SourceSpan {
  start: SourcePosition
  end: SourcePosition
}

export interface RawSourceMap {
  version: number
  file?: string
  sources: string[]
  sourceRoot?: string
  sourcesContent: Array<string | null>
  names: string[]
  mappings: string
}

export interface TransformModuleOptions {
  source: string
  filename: string
  target: 'dom' | 'ssr'
  runtimeModule: string
  delegateEvents: boolean
  sourceMap: boolean
  hmr?: boolean
}

export interface TransformModuleResult {
  code: string
  map: RawSourceMap | null
  diagnostics: CompilerDiagnostic[]
}

const native = require('@zeus-js/compiler-native') as {
  transformModule(options: TransformModuleOptions): TransformModuleResult
}

export const transformModule = native.transformModule

export default transformModule
