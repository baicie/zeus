import { describe, expect, it } from 'vitest'
import { compiler } from '@zeus-js/compiler-core'

describe('Compiler Core', () => {
  describe('Basic Compilation', () => {
    it('should compile simple JSX', () => {
      const source = `const App = () => <div>Hello</div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
      expect(result.code).toContain('template')
    })

    it('should compile TSX with types', () => {
      const source = `const App = () => <div>{'hello'}</div>`
      const result = compiler(source, {
        sourceType: 'tsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
    })

    it('should handle non-JSX code', () => {
      const source = `const add = (a, b) => a + b`
      const result = compiler(source, {
        sourceType: 'js',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
      expect(result.code).toBe(source)
    })
  })

  describe('Error Handling', () => {
    it('should return error for invalid JSX syntax', () => {
      const source = `const App = () => <div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should return friendly error message', () => {
      const source = `const App = () => <div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      // Error message should contain "Compilation error"
      expect(result.errors[0]).toContain('Compilation error')
    })
  })

  describe('Options', () => {
    it('should respect target option', () => {
      const source = `const App = () => <div>test</div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
    })

    it('should handle minify option', () => {
      const source = `const App = () => <div>test</div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: true,
      })

      expect(result.success).toBe(true)
    })
  })
})
