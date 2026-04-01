import { describe, expect, it } from 'vitest'
import { compiler } from '@zeus-js/compiler-core'

describe('Compiler IIFE', () => {
  describe('Dynamic Children', () => {
    it('should generate IIFE for JSX with dynamic text', () => {
      const source = `const x = 1; function App() { return <div>{x}</div>; }`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
      // 应该包含 IIFE 结构
      expect(result.code).toContain('(() => {')
      // 应该包含 insert 调用
      expect(result.code).toContain('insert(')
      // 不应该包含 <!--[N]--> 占位符
      expect(result.code).not.toContain('<!--[0]-->')
    })

    it('should generate templates for JSX in map callbacks', () => {
      const source = `const NAV_ITEMS = [];
const App = () => <div>{NAV_ITEMS.map((i) => <span>{i}</span>)}</div>`
      const result = compiler(source, {
        sourceType: 'jsx',
        experimental: true,
        target: 'es5',
        minify: false,
      })

      expect(result.success).toBe(true)
      // 应该生成多个模板
      expect(result.code).toContain('template("<span></span>")')
      expect(result.code).toContain('template("<div></div>")')
      // 不应该包含 <!--[N]--> 占位符
      expect(result.code).not.toContain('<!--[0]-->')
    })
  })
})
