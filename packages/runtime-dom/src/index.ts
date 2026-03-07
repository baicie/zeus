import { effect } from '@zeus-js/signal'

// Core compilation helpers (called by compiler-generated code)
export {
  template,
  insert,
  delegateEvents,
  addEventListener,
  setAttribute,
  setProperty,
  className,
  style,
  spread,
} from './client'

// Low-level DOM utilities
export * from './dom'
export * from './events'
export * from './directives'

// SolidJS-style DOM types and JSX support
export * from './jsx'
export * from './h'

// Re-export everything from runtime-core (including slots)
export * from '@zeus-js/runtime-core'

// Re-export component types
export type { ComponentFunction, App } from '@zeus-js/runtime-core'

// createApp for direct-DOM components
export function createApp(rootComponent: (props?: any) => Node): {
  mount: (containerOrSelector: Element | string) => void
  unmount: () => void
} {
  let container: Element | null = null
  let rootNode: Node | null = null
  let disposeEffect: (() => void) | null = null

  const app = {
    mount(containerOrSelector: Element | string): void {
      if (typeof containerOrSelector === 'string') {
        container = document.querySelector(containerOrSelector)
        if (!container) {
          throw new Error(`Container element not found: ${containerOrSelector}`)
        }
      } else {
        container = containerOrSelector
      }
      container.innerHTML = ''

      // Create effect for reactive updates
      disposeEffect = effect(() => {
        if (rootNode && container) {
          container.removeChild(rootNode)
        }
        rootNode = rootComponent()
        if (rootNode && container) {
          container.appendChild(rootNode)
        }
      })

      // Register to global HMR runtime if available (Vue-like approach)
      if (typeof window !== 'undefined') {
        const hmrRuntime = (window as any).__ZEUS_HMR_RUNTIME__
        if (hmrRuntime) {
          // Create record for this app
          hmrRuntime.createRecord('root', rootComponent)
        }
      }
    },

    unmount(): void {
      if (disposeEffect) {
        disposeEffect()
        disposeEffect = null
      }
      if (rootNode && container) {
        container.removeChild(rootNode)
        rootNode = null
      }
    },
  }

  return app
}
