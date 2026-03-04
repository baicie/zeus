// packages/web-components/src/adapter/index.ts

import type { ComponentFunction } from '@zeus-js/runtime-core'
import { render } from '@zeus-js/runtime-core'
import { registerComponent } from '../registry'

export interface WebComponentOptions<P = any> {
  // 是否使用 Shadow DOM，默认 false（Light DOM，直接渲染到自定义元素内部）
  shadow?: boolean
  // 要监听的属性列表，对应 Web Components 的 observedAttributes
  observedAttributes?: string[]
  // 将 attribute 映射到 props 的钩子，默认为字符串赋值
  attributeToProps?: (name: string, value: string | null, props: P) => void
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

  return class ZeusWebComponent extends HTMLElement {
    static get observedAttributes(): string[] {
      return observed
    }

    private _root: Element | ShadowRoot | null
    private _mounted: boolean
    private _props: P

    constructor() {
      super()
      this._mounted = false
      this._props = {} as unknown as P
      this._root = null
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
  }
}

export function adaptToWebComponent<P = any>(
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
