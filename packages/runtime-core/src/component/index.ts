// packages/runtime-core/src/component/index.ts

export interface Component {
  setup?: (props: any) => () => Element | DocumentFragment
  render?: () => Element | DocumentFragment
  mounted?: () => void
  updated?: () => void
  unmounted?: () => void
}

export function defineComponent(component: Component): Component {
  return component
}

export interface App {
  mount(container: Element | string): void
  unmount(): void
}

export function createApp(rootComponent: Component): App {
  return {
    mount(container: Element | string) {
      // 实现挂载逻辑
    },
    unmount() {
      // 实现卸载逻辑
    },
  }
}
