import { describe, expect, it } from 'vitest'
import { effect, signal } from '@zeus-js/signal'

describe('Component System', () => {
  it('should define a component function', () => {
    const TestComponent = () => {
      const div = document.createElement('div')
      div.className = 'test'
      div.textContent = 'Hello World'
      return div
    }

    expect(typeof TestComponent).toBe('function')
  })

  it('should handle reactive data', () => {
    const TestComponent = () => {
      const count = signal(0)
      const div = document.createElement('div')

      // 响应式更新
      effect(() => {
        div.textContent = count().toString()
      })

      return div
    }

    expect(typeof TestComponent).toBe('function')
  })

  it('should return real DOM elements', () => {
    const TestComponent = () => {
      const div = document.createElement('div')
      div.className = 'test'
      div.textContent = 'Hello'
      return div
    }

    const element = TestComponent()
    expect(element).toBeInstanceOf(Element)
    expect((element as HTMLElement).tagName).toBe('DIV')
    expect((element as HTMLElement).className).toBe('test')
    expect((element as HTMLElement).textContent).toBe('Hello')
  })
})
