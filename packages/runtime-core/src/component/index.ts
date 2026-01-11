import { extend } from '@zeus-js/shared'
export interface ComponentProps {
  [key: string]: any
}

export interface ComponentInstance {
  props: ComponentProps
  setup?: (props: ComponentProps) => (() => Element | DocumentFragment) | void
  render?: () => Element | DocumentFragment
  mounted?: () => void
  updated?: () => void
  unmounted?: () => void
  $el?: Element | DocumentFragment
  $parent?: ComponentInstance
  $children: ComponentInstance[]
  $data: Record<string, any>
}

export interface Component {
  name?: string
  props?: Record<string, any>
  setup?: (props?: ComponentProps) => (() => Element | DocumentFragment) | void
  render?: () => Element | DocumentFragment
  mounted?: () => void
  updated?: () => void
  unmounted?: () => void
}

export function defineComponent(component: Component): Component {
  return component
}

export function createComponentInstance(
  component: Component,
  props: ComponentProps = {},
): ComponentInstance {
  const instance: ComponentInstance = {
    props: extend({}, props),
    $children: [],
    $data: {},
    // ...(component.setup ? { setup: component.setup } : {}),
    // ...(component.render ? { render: component.render } : {}),
    // ...(component.mounted ? { mounted: component.mounted } : {}),
    // ...(component.updated ? { updated: component.updated } : {}),
    // ...(component.unmounted ? { unmounted: component.unmounted } : {}),
  }

  return instance
}

export interface App {
  mount(container: Element | string): void
  unmount(): void
  component(name: string, component: Component): App
}

export function createApp(rootComponent: Component): App {
  const components = new Map<string, Component>()
  let rootInstance: ComponentInstance | null = null
  let container: Element | null = null

  const app: App = {
    mount(containerOrSelector: Element | string) {
      if (typeof containerOrSelector === 'string') {
        const el = document.querySelector(containerOrSelector)
        if (!el) {
          throw new Error(`Container element not found: ${containerOrSelector}`)
        }
        container = el
      } else {
        container = containerOrSelector
      }

      // 创建根组件实例
      rootInstance = createComponentInstance(rootComponent)

      // 调用setup
      if (rootInstance.setup) {
        const setupResult = rootInstance.setup(rootInstance.props)
        if (typeof setupResult === 'function') {
          rootInstance.render = setupResult
        }
      }

      // 初次渲染
      if (rootInstance.render) {
        rootInstance.$el = rootInstance.render()
        if (container && rootInstance.$el) {
          container.appendChild(rootInstance.$el)
        }
      }

      // 调用mounted生命周期
      if (rootInstance.mounted) {
        rootInstance.mounted()
      }
    },

    unmount() {
      if (rootInstance && rootInstance.unmounted) {
        rootInstance.unmounted()
      }

      if (container && rootInstance && rootInstance.$el) {
        container.removeChild(rootInstance.$el)
      }

      rootInstance = null
      container = null
    },

    component(name: string, component: Component): App {
      components.set(name, component)
      return app
    },
  }

  return app
}
