import { createRoot } from '@zeusjs/core'
import { toKebabCase } from './utils'

export interface ElementOptions {
  shadow?: boolean | 'open' | 'closed'
  delegatesFocus?: boolean
  props?: Record<
    string,
    StringConstructor | NumberConstructor | BooleanConstructor
  >
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
}

function coerceValue(
  raw: string | null,
  type?: StringConstructor | NumberConstructor | BooleanConstructor,
) {
  if (type === Boolean) return raw !== null
  if (type === Number) return raw == null ? undefined : Number(raw)
  if (type === String) return raw ?? undefined
  return raw
}

export function defineElement(
  tag: string,
  options: ElementOptions,
  setup: (props: any, host: HTMLElement) => Node,
) {
  const observed = Object.keys(options.props || {}).map(toKebabCase)

  class ZeusElement extends HTMLElement {
    private _dispose?: () => void
    private _props: Record<string, any> = {}
    private _mountRoot!: HTMLElement | ShadowRoot

    static get observedAttributes() {
      return observed
    }

    constructor() {
      super()
      this._initProps()
    }

    private _initProps() {
      const props = options.props || {}
      for (const key in props) {
        this._props[key] = undefined
      }
    }

    connectedCallback() {
      if (this._dispose) return

      this._mountRoot =
        options.shadow && options.shadow !== false
          ? this.attachShadow({
              mode: options.shadow === 'closed' ? 'closed' : 'open',
              delegatesFocus: !!options.delegatesFocus,
            })
          : this

      this._dispose = createRoot(dispose => {
        this._syncInitialAttributes()
        const tree = setup(this._props, this)
        this._mountRoot.appendChild(tree)

        if (options.shadow === false) {
          this._setupLightDomProjection()
        }

        return dispose
      })
    }

    disconnectedCallback() {
      this._dispose?.()
      this._dispose = undefined
    }

    attributeChangedCallback(
      name: string,
      _prev: string | null,
      next: string | null,
    ) {
      const propName = toCamelCase(name)
      this._props[propName] = coerceValue(next, options.props?.[propName])
    }

    private _syncInitialAttributes() {
      const props = options.props || {}
      for (const key in props) {
        const kebabKey = toKebabCase(key)
        const attrValue = this.getAttribute(kebabKey)
        this._props[key] = coerceValue(attrValue, props[key])
      }
    }

    private _setupLightDomProjection() {
      // Placeholder for light DOM projection setup
    }
  }

  customElements.define(tag, ZeusElement)
  return ZeusElement
}
