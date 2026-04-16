// Compiler diagnostics types and utilities

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  code: string
  severity: DiagnosticSeverity
  message: string
  location?: DiagnosticLocation
}

export interface DiagnosticLocation {
  file?: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
}

export const DIAGNOSTIC_CODES = {
  // Props
  REACTIVE_PROPS_DESTRUCTURING: 'ZEUS001',
  UNSTABLE_KEY_EXPRESSION: 'ZEUS002',

  // Host/Slot
  HOST_OUTSIDE_DEFINE_ELEMENT: 'ZEUS003',
  SLOT_OUTSIDE_HOST: 'ZEUS004',
  HOST_IN_NESTED_CONTEXT: 'ZEUS005',

  // Control flow
  SHOW_WITHOUT_WHEN: 'ZEUS010',
  FOR_WITHOUT_EACH: 'ZEUS011',

  // JSX
  UNSUPPORTED_JSX_EXPRESSION: 'ZEUS020',
  COMPLEX_CHILDREN_NOT_SUPPORTED: 'ZEUS021',

  // Other
  UNKNOWN: 'ZEUS999',
} as const

export function createDiagnostic(
  code: keyof typeof DIAGNOSTIC_CODES,
  severity: DiagnosticSeverity,
  message: string,
  location?: DiagnosticLocation,
): Diagnostic {
  return {
    code: DIAGNOSTIC_CODES[code],
    severity,
    message,
    location,
  }
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const loc = diagnostic.location
  const locationStr = loc
    ? `${loc.file || ''}:${loc.line}:${loc.column}`
    : ''

  return `[${diagnostic.code}] ${diagnostic.severity.toUpperCase()}${locationStr ? ` (${locationStr})` : ''}: ${diagnostic.message}`
}

export class DiagnosticCollector {
  private diagnostics: Diagnostic[] = []

  add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic)
  }

  error(code: keyof typeof DIAGNOSTIC_CODES, message: string, location?: DiagnosticLocation): void {
    this.add(createDiagnostic(code, 'error', message, location))
  }

  warning(code: keyof typeof DIAGNOSTIC_CODES, message: string, location?: DiagnosticLocation): void {
    this.add(createDiagnostic(code, 'warning', message, location))
  }

  info(code: keyof typeof DIAGNOSTIC_CODES, message: string, location?: DiagnosticLocation): void {
    this.add(createDiagnostic(code, 'info', message, location))
  }

  getDiagnostics(): Diagnostic[] {
    return [...this.diagnostics]
  }

  hasErrors(): boolean {
    return this.diagnostics.some(d => d.severity === 'error')
  }

  clear(): void {
    this.diagnostics = []
  }
}
