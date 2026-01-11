import { describe, expect, it } from 'vitest'
import { createApp, defineComponent } from '../component'
import { signal } from '@zeus-js/signal'

describe('Component System', () => {
  it('should define a component', () => {
    const TestComponent = defineComponent({
      name: 'TestComponent',
      setup() {
        return () => document.createElement('div')
      },
    })

    expect(TestComponent.name).toBe('TestComponent')
    expect(typeof TestComponent.setup).toBe('function')
  })

  it('should create app instance', () => {
    const TestComponent = defineComponent({
      name: 'TestComponent',
      setup() {
        return () => document.createElement('div')
      },
    })

    const app = createApp(TestComponent)

    expect(typeof app.mount).toBe('function')
    expect(typeof app.unmount).toBe('function')
    expect(typeof app.component).toBe('function')
  })

  it('should handle reactive data', () => {
    const TestComponent = defineComponent({
      name: 'TestComponent',
      setup() {
        const count = signal(0)

        return () => {
          const div = document.createElement('div')
          div.textContent = count().toString()
          return div
        }
      },
    })

    const component = TestComponent.setup?.()
    expect(component).toBeDefined()
    expect(typeof component).toBe('function')

    if (component) {
      const element = component()
      expect((element as HTMLElement).tagName).toBe('DIV')
      expect(element.textContent).toBe('0')
    }
  })
})
