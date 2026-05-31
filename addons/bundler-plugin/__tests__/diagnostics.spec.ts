import { describe, expect, it } from 'vitest'

import { formatDiagnostic, hasErrorDiagnostics } from '../src/diagnostics'

import type { AnalyzerDiagnostic } from '@zeus-js/component-analyzer'

describe('diagnostics', () => {
  describe('formatDiagnostic', () => {
    it('formats error diagnostic', () => {
      const diagnostic: AnalyzerDiagnostic = {
        level: 'error',
        file: 'src/components/Button.tsx',
        message: 'Missing required prop "name"',
      }

      const result = formatDiagnostic(diagnostic)
      expect(result).toContain('[zeus component-analyzer]')
      expect(result).toContain('src/components/Button.tsx')
      expect(result).toContain('Missing required prop "name"')
    })

    it('formats warning diagnostic', () => {
      const diagnostic: AnalyzerDiagnostic = {
        level: 'warning',
        file: 'src/components/Button.tsx',
        message: 'Unused prop "unused"',
      }

      const result = formatDiagnostic(diagnostic)
      expect(result).toContain('[zeus component-analyzer]')
      expect(result).toContain('src/components/Button.tsx')
      expect(result).toContain('Unused prop "unused"')
    })
  })

  describe('hasErrorDiagnostics', () => {
    it('returns true when there are error diagnostics', () => {
      const diagnostics: AnalyzerDiagnostic[] = [
        {
          level: 'warning',
          file: 'a.tsx',
          message: 'warning',
        },
        {
          level: 'error',
          file: 'b.tsx',
          message: 'error',
        },
      ]

      expect(hasErrorDiagnostics(diagnostics)).toBe(true)
    })

    it('returns false when there are only warnings', () => {
      const diagnostics: AnalyzerDiagnostic[] = [
        {
          level: 'warning',
          file: 'a.tsx',
          message: 'warning',
        },
        {
          level: 'warning',
          file: 'b.tsx',
          message: 'another warning',
        },
      ]

      expect(hasErrorDiagnostics(diagnostics)).toBe(false)
    })

    it('returns false for empty diagnostics', () => {
      expect(hasErrorDiagnostics([])).toBe(false)
    })
  })
})
