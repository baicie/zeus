import { describe, expect, it } from 'vitest'
import { createApp } from '../component'
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

  it('should create app instance', () => {
    const TestComponent = () => {
      const div = document.createElement('div')
      div.textContent = 'Test'
      return div
    }

    const app = createApp(TestComponent)

    expect(typeof app.mount).toBe('function')
    expect(typeof app.unmount).toBe('function')
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

  it('should mount and unmount components', () => {
    // 创建测试组件 / Create test component
    const TestComponent = () => {
      const div = document.createElement('div')
      div.textContent = 'Mounted'
      return div
    }

    const app = createApp(TestComponent)

    // 创建容器元素 / Create container element
    const container = document.createElement('div')
    document.body.appendChild(container)

    // 挂载组件 / Mount component
    app.mount(container)
    expect(container.children.length).toBe(1)
    expect(container.children[0].textContent).toBe('Mounted')

    // 卸载组件 / Unmount component
    app.unmount()
    expect(container.children.length).toBe(0)

    // 清理测试环境 / Clean up test environment
    document.body.removeChild(container)
  })
})
