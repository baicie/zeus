import { computed, effect, signal } from '@zeus-js/runtime'

/**
 * 函数式 Web Component 的 Props 类型
 */
export interface ComponentProps {
  [key: string]: any
}

/**
 * 函数式组件的渲染函数类型
 * 返回 DOM 元素或字符串
 */
export type ComponentFunction<T extends ComponentProps = ComponentProps> = (
  props: T
) => Element | string | null

/**
 * 函数式 Web Component 的配置选项
 */
export interface FunctionalWCOptions {
  /** 是否使用 Shadow DOM */
  shadow?: boolean
  /** 自定义样式 */
  styles?: string
  /** 观察的属性 */
  observedAttributes?: string[]
  /** 组件名称 */
  tagName: string
}

/**
 * 函数式 Web Component 的上下文
 */
export interface ComponentContext {
  /** 当前组件的 props */
  props: ComponentProps
  /** 当前组件的 DOM 容器 */
  container: Element | ShadowRoot
  /** 清理函数列表 */
  cleanup: (() => void)[]
  /** 是否已挂载 */
  mounted: boolean
}

/**
 * 创建函数式 Web Component
 */
export function createFunctionalWC<T extends ComponentProps = ComponentProps>(
  componentFn: ComponentFunction<T>,
  options: FunctionalWCOptions
): typeof HTMLElement {
  const { shadow = true, styles, observedAttributes = [], tagName } = options

  class FunctionalWebComponent extends HTMLElement {
    private context: ComponentContext
    private renderer: (() => void) | null = null

    constructor() {
      super()

      this.context = {
        props: {},
        container: shadow ? this.attachShadow({ mode: 'open' }) : this,
        cleanup: [],
        mounted: false,
      }

      // 添加样式
      if (styles && shadow) {
        // eslint-disable-next-line no-restricted-globals
        const styleElement = document.createElement('style')
        styleElement.textContent = styles
        this.context.container.appendChild(styleElement)
      }
    }

    static get observedAttributes() {
      return observedAttributes
    }

    connectedCallback() {
      this.context.mounted = true
      this.render()
    }

    disconnectedCallback() {
      this.context.mounted = false
      this.cleanup()
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
      if (oldValue !== newValue) {
        this.context.props[name] = newValue
        if (this.context.mounted) {
          this.render()
        }
      }
    }

    private render() {
      if (!this.context.mounted) return

      // 清理之前的渲染
      this.cleanup()

      // 创建新的渲染函数
      this.renderer = () => {
        if (!this.context.mounted) return

        // 清空容器
        if (this.context.container !== this) {
          this.context.container.innerHTML = ''
        } else {
          // 对于 light DOM，只清空子元素
          while (this.context.container.firstChild) {
            this.context.container.removeChild(
              this.context.container.firstChild
            )
          }
        }

        // 渲染组件
        const result = componentFn(this.context.props as T)
        if (result instanceof Element) {
          this.context.container.appendChild(result)
        } else if (typeof result === 'string') {
          this.context.container.innerHTML = result
        }
      }

      // 执行渲染
      this.renderer()
    }

    private cleanup() {
      this.context.cleanup.forEach(fn => fn())
      this.context.cleanup = []
      this.renderer = null
    }

    // 提供 props 更新方法
    updateProps(newProps: Partial<T>) {
      Object.assign(this.context.props, newProps)
      if (this.context.mounted) {
        this.render()
      }
    }
  }

  // 注册自定义元素
  customElements.define(tagName, FunctionalWebComponent)

  return FunctionalWebComponent
}

/**
 * 创建简单的函数式 Web Component（快捷方式）
 */
export function defineFunctionalWC<T extends ComponentProps = ComponentProps>(
  tagName: string,
  componentFn: ComponentFunction<T>,
  options: Omit<FunctionalWCOptions, 'tagName'> = {}
): typeof HTMLElement {
  return createFunctionalWC(
    componentFn,
    Object.assign({}, options, { tagName })
  )
}

/**
 * 在函数式组件中使用的 Hooks
 */
export const hooks = {
  /**
   * 创建状态
   */
  useState: <T>(initialValue: T): (() => T) => {
    return signal(initialValue)
  },

  /**
   * 创建计算属性
   */
  useComputed: <T>(fn: () => T): (() => T) => {
    return computed(fn)
  },

  /**
   * 创建副作用
   */
  useEffect: (fn: () => void | (() => void), deps?: any[]): (() => void) => {
    return effect(fn)
  },

  /**
   * 获取当前组件的 props
   */
  useProps: <T extends ComponentProps = ComponentProps>(): T => {
    // 这个需要在组件上下文中使用
    throw new Error(
      'useProps must be used within a functional component context'
    )
  },
}
