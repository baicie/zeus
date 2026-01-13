// 组件函数类型 / Component function type
export type ComponentFunction = () => Element | DocumentFragment

// 应用接口 / App interface
export interface App {
  mount(container: Element | string): void
  unmount(): void
}

// 创建应用 / Create app
export function createApp(rootComponent: ComponentFunction): App {
  // 容器元素 / Container element
  let container: Element | null = null
  // 根组件元素 / Root component element
  let rootElement: Element | DocumentFragment | null = null

  const app: App = {
    mount(containerOrSelector: Element | string) {
      if (typeof containerOrSelector === 'string') {
        // 通过选择器查找DOM元素 / Find DOM element by selector
        const el = document.querySelector(containerOrSelector)
        if (!el) {
          throw new Error(`Container element not found: ${containerOrSelector}`)
        }
        container = el
      } else {
        // 直接使用传入的元素 / Use the element directly
        container = containerOrSelector
      }

      // 执行根组件并挂载到容器 / Execute root component and mount to container
      if (typeof rootComponent === 'function') {
        rootElement = rootComponent()
        if (container && rootElement) {
          container.appendChild(rootElement)
        }
      }
    },

    unmount() {
      // 从DOM中移除根元素 / Remove root element from DOM
      if (container && rootElement) {
        container.removeChild(rootElement)
      }
      // 清理引用 / Clean up references
      rootElement = null
      container = null
    },
  }

  return app
}
