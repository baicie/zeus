import type { CompilerErrorCode } from './codes'
import type { SourceSpan } from '@zeus-js/compiler-shared'

export type CompilerDiagnosticSeverity = 'error' | 'warning'

export interface CompilerDiagnostic {
  code: CompilerErrorCode
  severity: CompilerDiagnosticSeverity
  message: string
  hint?: string
  filename?: string
  span?: SourceSpan
}

export type CompilerDiagnosticInput = Omit<CompilerDiagnostic, 'severity'> & {
  severity?: CompilerDiagnosticSeverity
}

export function createCompilerDiagnostic(
  input: CompilerDiagnosticInput,
): CompilerDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    ...(input.hint === undefined ? {} : { hint: input.hint }),
    ...(input.filename === undefined ? {} : { filename: input.filename }),
    ...(input.span === undefined ? {} : { span: input.span }),
  }
}

export function formatCompilerDiagnostic(
  diagnostic: CompilerDiagnostic,
): string {
  const hint = diagnostic.hint ? `\nHint: ${diagnostic.hint}` : ''

  return `[${diagnostic.code}] ${diagnostic.message}${hint}`
}
