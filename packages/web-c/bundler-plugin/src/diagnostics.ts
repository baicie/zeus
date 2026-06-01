import type { AnalyzerDiagnostic } from '@zeus-js/component-analyzer'

export function formatDiagnostic(diagnostic: AnalyzerDiagnostic): string {
  return `[zeus component-analyzer] ${diagnostic.file}: ${diagnostic.message}`
}

export function hasErrorDiagnostics(
  diagnostics: AnalyzerDiagnostic[],
): boolean {
  return diagnostics.some(item => item.level === 'error')
}
