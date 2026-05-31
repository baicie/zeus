import { describe, expect, it } from 'vitest'

import { toAbsoluteImportPath, normalizePath } from '../src/imports'

describe('imports', () => {
  describe('toAbsoluteImportPath', () => {
    it('resolves source path relative to root', () => {
      const result = toAbsoluteImportPath('/project', 'src/button.tsx')
      expect(result).toBe('/project/src/button.tsx')
    })

    it('normalizes backslashes to forward slashes', () => {
      const result = toAbsoluteImportPath('/project', 'src/button.tsx')
      expect(result).not.toContain('\\')
    })
  })

  describe('normalizePath', () => {
    it('converts backslashes to forward slashes', () => {
      expect(normalizePath('C:\\project\\src\\button.tsx')).toBe(
        'C:/project/src/button.tsx',
      )
    })

    it('leaves already-normalized paths unchanged', () => {
      expect(normalizePath('/project/src/button.tsx')).toBe(
        '/project/src/button.tsx',
      )
    })

    it('handles mixed slashes', () => {
      expect(normalizePath('C:\\project/src\\button.tsx')).toBe(
        'C:/project/src/button.tsx',
      )
    })
  })
})
