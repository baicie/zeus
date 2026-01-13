// 纯函数式组件类型定义
export interface ComponentProps {
  [key: string]: any
}

export interface ComponentContext {
  props: ComponentProps
  emit: (event: string, ...args: any[]) => void
  slots: Record<string, () => any>
  expose: (exposed: Record<string, any>) => void
}

export type ComponentFunction<T = ComponentProps> = (props: T) => any
export type SetupFunction<T = ComponentProps> = (
  props: T,
  context: ComponentContext,
) => ComponentFunction | void
export type ComponentSetup = SetupFunction | ComponentFunction

// 纯函数式组件创建
export function h(
  type: string | ComponentSetup,
  props?: ComponentProps | null,
  ...children: any[]
): any {
  return {
    type,
    props: props || {},
    children,
  }
}

// h 函数已经在上面声明并导出了

// 函数式组件组合
export function withProps<P extends ComponentProps>(
  component: ComponentFunction,
  defaultProps: Partial<P>,
): ComponentFunction<P> {
  return (props: P) => component(Object.assign({}, defaultProps, props))
}

// 函数式组件组合（高阶组件）
export function withHoc<P extends ComponentProps>(
  hoc: (component: ComponentFunction<P>) => ComponentFunction<P>,
): (component: ComponentFunction<P>) => ComponentFunction<P> {
  return (component: ComponentFunction<P>) => hoc(component)
}

// 纯函数式应用创建
export interface App {
  mount(container: Element | string): void
  unmount(): void
  component(name: string, component: ComponentSetup): App
}

export function createApp(rootComponent: ComponentSetup): App {
  const components = new Map<string, ComponentSetup>()
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

      // 执行根组件
      if (typeof rootComponent === 'function') {
        rootComponent(
          {},
          {
            props: {},
            emit: () => {},
            slots: {},
            expose: () => {},
          },
        )
      }
    },

    unmount() {
      // 清理逻辑
      if (container) {
        container.innerHTML = ''
      }
      container = null
    },

    component(name: string, component: ComponentSetup): App {
      components.set(name, component)
      return app
    },
  }

  return app
}
