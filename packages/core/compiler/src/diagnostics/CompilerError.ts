import {
  createCompilerDiagnostic,
  formatCompilerDiagnostic,
  type CompilerDiagnostic,
} from './CompilerDiagnostic'

import type { CompilerErrorCode } from './codes'
import type { SourcePosition, SourceSpan } from '@zeus-js/compiler-shared'

export interface CompilerErrorOptions {
  code: CompilerErrorCode
  message: string
  hint?: string
  filename?: string
  span?: SourceSpan
}

export class CompilerError extends Error {
  readonly diagnostic: CompilerDiagnostic
  readonly code: CompilerDiagnostic['code']
  readonly severity: 'error'
  readonly hint?: string
  readonly filename?: string
  readonly span?: SourceSpan
  readonly loc?: Pick<SourcePosition, 'line' | 'column'>

  constructor(options: CompilerErrorOptions) {
    const diagnostic = createCompilerDiagnostic({
      ...options,
      severity: 'error',
    })

    super(formatCompilerDiagnostic(diagnostic))

    this.name = 'ZeusCompilerError'
    this.diagnostic = diagnostic
    this.code = diagnostic.code
    this.severity = 'error'
    this.hint = diagnostic.hint
    this.filename = diagnostic.filename
    this.span = diagnostic.span
    this.loc = diagnostic.span
      ? {
          line: diagnostic.span.start.line,
          column: diagnostic.span.start.column,
        }
      : undefined
  }
}
