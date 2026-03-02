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
  createComponent,
} from './client'

// Low-level DOM utilities
export * from './dom'
export * from './events'
export * from './directives'

// Re-export signal system
export { signal, computed, effect, effectScope } from '@zeus-js/signal'

// Re-export lifecycle hooks (VNode-independent)
export {
  onMounted,
  onUnmounted,
  onUpdated,
  onBeforeMount,
  onBeforeUnmount,
  watchEffect,
} from '@zeus-js/runtime-core'

// Re-export component types
export type { ComponentFunction, App } from '@zeus-js/runtime-core'

// createApp for direct-DOM components
export function createApp(rootComponent: (props?: any) => Node) {
  let container: Element | null = null
  let rootNode: Node | null = null

  return {
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
      rootNode = rootComponent()
      if (rootNode) container.appendChild(rootNode)
    },
    unmount(): void {
      if (rootNode && container) {
        container.removeChild(rootNode)
        rootNode = null
      }
    },
  }
}
