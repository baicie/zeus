// packages/web-components/src/adapter/index.ts

import type { ComponentFunction } from '@zeus-js/runtime-core'
import type { Store } from '@zeus-js/store'
import { createContext, provide, render } from '@zeus-js/runtime-core'
import { extend } from '@zeus-js/shared'
import { registerComponent } from '../registry'

// Store Context
const StoreContext = createContext<Store<any> | undefined>(undefined)

export interface WebComponentOptions<P = any> {
  // 是否使用 Shadow DOM，默认 false（Light DOM，直接渲染到自定义元素内部）
  shadow?: boolean
  // 要监听的属性列表，对应 Web Components 的 observedAttributes
  observedAttributes?: string[]
  // 将 attribute 映射到 props 的钩子，默认为字符串赋值
  attributeToProps?: (name: string, value: string | null, props: P) => void
  // Store 相关配置
  store?: Store<any>
  storeGetter?: () => Store<any>
}

export function createWebComponentAdapter<P = any>(
  component: ComponentFunction<P>,
  options?: WebComponentOptions<P>,
): typeof HTMLElement {
  const useShadow = !!(options && options.shadow)
  const observed =
    options && options.observedAttributes
      ? options.observedAttributes.slice()
      : []

  const attributeToProps =
    options && options.attributeToProps
      ? options.attributeToProps
      : function (name: string, value: string | null, props: any): void {
          // 默认行为：全部按字符串塞进 props
          props[name] = value
        }

  // Store 配置
  const store = options && options.store ? options.store : undefined
  const storeGetter =
    options && options.storeGetter ? options.storeGetter : undefined

  return class ZeusWebComponent extends HTMLElement {
    static get observedAttributes(): string[] {
      return observed
    }

    private _root: Element | ShadowRoot | null
    private _mounted: boolean
    private _props: P
    private _cleanupStore: (() => void) | null = null

    constructor() {
      super()
      this._mounted = false
      this._props = {} as unknown as P
      this._root = null
      this._cleanupStore = null
    }

    connectedCallback(): void {
      if (this._mounted) {
        return
      }

      // 初始化渲染根
      if (useShadow) {
        if (!this.shadowRoot) {
          this._root = this.attachShadow({ mode: 'open' })
        } else {
          this._root = this.shadowRoot
        }
      } else {
        this._root = this
      }

      // 初始化 props：先从已存在的 attributes 里读一遍
      this._initializePropsFromAttributes()

      // 提供 Store 给后代组件
      this._setupStore()

      // 初次渲染
      if (this._root) {
        render(() => {
          return component(this._props)
        }, this._root as Element)
      }

      this._mounted = true
    }

    disconnectedCallback(): void {
      if (!this._mounted) {
        return
      }

      // 清理 Store
      if (this._cleanupStore) {
        this._cleanupStore()
        this._cleanupStore = null
      }

      if (this._root) {
        ;(this._root as Element).innerHTML = ''
      }

      this._mounted = false
    }

    attributeChangedCallback(
      name: string,
      _oldValue: string | null,
      newValue: string | null,
    ): void {
      // 更新 props 并重新渲染
      attributeToProps(name, newValue, this._props)

      if (this._mounted && this._root) {
        render(() => {
          return component(this._props)
        }, this._root as Element)
      }
    }

    private _initializePropsFromAttributes(): void {
      const attrs = this.attributes
      const len = attrs.length
      for (let i = 0; i < len; i++) {
        const attr = attrs.item(i)
        if (!attr) continue
        const name = attr.name
        const value = attr.value
        attributeToProps(name, value, this._props)
      }
    }

    private _setupStore(): void {
      let currentStore: Store<any> | undefined = store

      // 如果有 storeGetter，调用它获取 store
      if (!currentStore && storeGetter) {
        currentStore = storeGetter()
      }

      // 如果获取到了 store，提供给后代
      if (currentStore) {
        // 使用 provide 函数提供 store 到 context
        provide(currentStore, StoreContext.id)
      }
    }

    // 公共方法：获取当前组件提供的 Store
    public getProvidedStore(): Store<any> | undefined {
      if (store) return store
      if (storeGetter) return storeGetter()
      return undefined
    }
  }
}

/**
 * defineCustomElement - 定义并注册 Web Component
 *
 * @example
 * ```ts
 * function MyButton({ variant = 'primary', children }) {
 *   return <button class={`btn btn-${variant}`}>{children}</button>
 * }
 *
 * defineCustomElement(MyButton, {
 *   tagName: 'my-button',
 *   props: {
 *     variant: { type: String, default: 'primary' },
 *   },
 * })
 * ```
 */
export function defineCustomElement<P = any>(
  component: ComponentFunction<P>,
  options: WebComponentOptions<P> & {
    tagName: string
  },
): typeof HTMLElement {
  const ElementClass = createWebComponentAdapter(component, options)

  // 注册到全局 customElements，并记录到本地 registry
  registerComponent(options.tagName, ElementClass)

  return ElementClass
}

// ============================================
// Store 便捷方法
// ============================================

/**
 * 创建支持 Store 的 Web Component 的便捷方法
 *
 * @example
 * ```ts
 * const useCounterStore = defineStore({
 *   name: 'counter',
 *   state: { count: 0 }
 * })
 *
 * function Counter({ count, increment }) {
 *   return <button onClick={increment}>{count}</button>
 * }
 *
 * // 创建并注册组件
 * createStoreWebComponent('my-counter', Counter, useCounterStore)
 * ```
 */
export function createStoreWebComponent<P extends object>(
  tagName: string,
  component: ComponentFunction<P>,
  storeDefinition: () => Store<any>,
  options?: Omit<WebComponentOptions<P>, 'store' | 'storeGetter'>,
): typeof HTMLElement {
  return defineCustomElement(
    component,
    extend({ tagName, storeGetter: storeDefinition }, options),
  )
}
