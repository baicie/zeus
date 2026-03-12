import { effect } from '@zeus-js/signal'
import type { App } from '@zeus-js/runtime-core'

// Helper to add nodes to container (handles arrays)
function appendNodes(
  container: Element,
  nodes: Node | Node[] | null | undefined,
): void {
  if (!nodes || !container) {
    return
  }
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      if (node instanceof Node) {
        container.appendChild(node)
      }
    }
  } else if (nodes instanceof Node) {
    container.appendChild(nodes)
  }
}

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
  ref,
  reconcileArray,
  keyed,
} from './client'

// Low-level DOM utilities
export * from './dom'
export * from './events'
export * from './directives'

// Built-in components
export * from './components'

// SolidJS-style DOM types and JSX support
export * from './jsx'
export * from './h'

// Re-export everything from runtime-core (including slots)
export * from '@zeus-js/runtime-core'

// Re-export component types
export type { ComponentFunction, App, Plugin } from '@zeus-js/runtime-core'

// createApp for direct-DOM components
export function createApp(rootComponent: (props?: any) => Node): App {
  let container: Element | null = null
  let rootNode: Node | null = null
  let disposeEffect: (() => void) | null = null

  const installedPlugins = new Set<any>()

  const app: App = {
    use(plugin: any, options?: any): App {
      if (installedPlugins.has(plugin)) {
        return app
      }

      if (plugin && typeof plugin.install === 'function') {
        plugin.install(app, options)
      } else if (typeof plugin === 'function') {
        plugin(app, options)
      }

      installedPlugins.add(plugin)
      return app
    },

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
        const newNodes = rootComponent()
        if (container) {
          appendNodes(container, newNodes)
        }
        // For single-node tracking, get the first node if exists
        if (Array.isArray(newNodes) && newNodes.length > 0) {
          rootNode = newNodes[0]
        } else if (newNodes instanceof Node) {
          rootNode = newNodes
        } else {
          rootNode = null
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
