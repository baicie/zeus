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

export * from './slots'

// Low-level DOM utilities
export * from './dom'
export * from './events'
export * from './directives'

// Re-export signal system
export { computed, effect, effectScope, signal } from '@zeus-js/signal'

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
  let disposeEffect: (() => void) | null = null

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

      // 使用 effect 追踪 signal 变化并自动更新
      // 创建一个 effect 来追踪所有 signal 变化
      disposeEffect = effect(() => {
        // 清理旧节点
        if (rootNode && container) {
          container.removeChild(rootNode)
        }
        // 重新渲染组件
        rootNode = rootComponent()
        if (rootNode && container) {
          container.appendChild(rootNode)
        }
      })
    },
    unmount(): void {
      // 清理 effect
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
}
