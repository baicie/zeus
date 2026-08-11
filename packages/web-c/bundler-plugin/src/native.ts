import { createRequire } from 'node:module'

import type { SourceMapInput } from 'rollup'

const require = createRequire(import.meta.url)

export interface NativeCompilerOptions {
  moduleName?: string
  delegateEvents?: boolean
}

export interface NativeCompilerDiagnostic {
  code: string
  message: string
  severity: 'error' | 'warning'
  filename: string
  hint?: string
  span?: {
    start: { offset: number; line: number; column: number }
    end: { offset: number; line: number; column: number }
  }
}

export interface NativeTransformResult {
  code: string
  map: SourceMapInput | null
  diagnostics: NativeCompilerDiagnostic[]
}

export const { transformModule } = require('@zeus-js/compiler-native') as {
  transformModule: (options: {
    source: string
    filename: string
    target: 'dom' | 'ssr'
    runtimeModule: string
    delegateEvents: boolean
    sourceMap: boolean
    hmr?: boolean
  }) => NativeTransformResult
}
