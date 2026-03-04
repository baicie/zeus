import { describe, expect, it } from 'vitest'
import { compiler } from '@zeus-js/compiler-core'

describe('Compiler Core', () => {
  // ... existing tests ...
})

describe('Compiler Slots', () => {
  describe('Slot Compilation', () => {
    it('should compile basic slot element', () => {
      const source = `const App = () => <div><slot /></div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
      expect(result.code).toContain('renderSlot')
    })

    it('should compile named slot', () => {
      const source = `const App = () => <div><slot name="header" /></div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
      expect(result.code).toContain('renderSlot')
    })

    it('should compile slot with fallback content', () => {
      const source = `const App = () => <div><slot>fallback</slot></div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
      expect(result.code).toContain('renderSlot')
    })
  })
})
