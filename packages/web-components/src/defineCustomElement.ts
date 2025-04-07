// packages/web-components/src/defineCustomElement.ts
import { render } from '@zeus-js/runtime-dom'
import { processSlotProjection } from '@zeus-js/runtime-dom/dist/primitives/web-components'
import type { CustomElementComponent, CustomElementOptions } from './types'

export function defineCustomElement(
  name: string,
  component: CustomElementComponent,
  options: CustomElementOptions = {}
) {
  class ZeusElement extends HTMLElement {
    static observedAttributes = Object.keys(options.props || {})

    private _shadowRoot: ShadowRoot | null = null
    private _cleanup: (() => void) | null = null
    private _props: Record<string, any> = {}

    constructor() {
      super()

      // 使用 shadow DOM 还是 light DOM
      if (options.shadow !== false) {
        this._shadowRoot = this.attachShadow({
          mode: options.mode || 'open',
          delegatesFocus: options.delegatesFocus,
        })
      }
    }

    connectedCallback() {
      // 收集属性
      this._updateProps()

      // 渲染组件
      const result = component(this._props)

      // 挂载
      if (this._shadowRoot) {
        // Shadow DOM 模式
        this._cleanup = render(result, this._shadowRoot)
      } else {
        // Light DOM 模式
        const fragment = document.createDocumentFragment()
        const cleanupFn = render(result, fragment)

        // 处理 slot 投影
        processSlotProjection(this, fragment, 'light')

        this._cleanup = cleanupFn
      }
    }

    disconnectedCallback() {
      if (this._cleanup) {
        this._cleanup()
        this._cleanup = null
      }
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
      if (oldValue !== newValue) {
        this._props[name] = newValue
        this.connectedCallback() // 重新渲染
      }
    }

    private _updateProps() {
      // 从属性收集
      Array.from(this.attributes).forEach(attr => {
        this._props[attr.name] = attr.value
      })

      // 收集 slot 内容
      if (!this._shadowRoot) {
        this._props.children = Array.from(this.childNodes)
      }
    }
  }

  // 如果需要扩展已有元素
  if (options.extends) {
    customElements.define(name, ZeusElement, { extends: options.extends })
  } else {
    customElements.define(name, ZeusElement)
  }

  return ZeusElement
}
