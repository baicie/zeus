import { render } from './render'

import type { JSXValue } from './types'

export type ElementPropConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor

export type DefineElementOptions<P extends Record<string, unknown>> = {
  shadow?: boolean | ShadowRootInit
  props?: Partial<Record<keyof P, ElementPropConstructor>>
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function castAttributeValue(
  value: string | null,
  type: ElementPropConstructor | undefined,
): unknown {
  if (type === Boolean) return value !== null
  if (type === Number) return value == null ? undefined : Number(value)
  return value
}

export function defineElement<P extends Record<string, unknown>>(
  tagName: string,
  options: DefineElementOptions<P>,
  setup: (props: P) => JSXValue,
): CustomElementConstructor {
  const propSchema = options.props ?? {}
  const attrToProp = new Map<string, string>()

  for (const key of Object.keys(propSchema)) {
    attrToProp.set(toKebabCase(key), key)
  }

  class ZeusElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return Array.from(attrToProp.keys())
    }

    private dispose?: () => void
    private props = {} as P

    connectedCallback(): void {
      if (this.dispose) return

      for (const [attr, prop] of attrToProp) {
        this.writePropFromAttribute(prop, this.getAttribute(attr))
      }

      const target =
        options.shadow === false || options.shadow == null
          ? this
          : this.attachShadow(
              typeof options.shadow === 'object'
                ? options.shadow
                : { mode: 'open' },
            )

      this.dispose = render(() => setup(this.props), target)
    }

    disconnectedCallback(): void {
      this.dispose?.()
      this.dispose = undefined
    }

    attributeChangedCallback(
      name: string,
      _oldValue: string | null,
      newValue: string | null,
    ): void {
      const prop = attrToProp.get(name)
      if (prop) this.writePropFromAttribute(prop, newValue)
    }

    private writePropFromAttribute(prop: string, value: string | null): void {
      const type = (
        propSchema as Record<string, ElementPropConstructor | undefined>
      )[prop]

      ;(this.props as Record<string, unknown>)[prop] = castAttributeValue(
        value,
        type,
      )
    }
  }

  if (!customElements.get(tagName)) {
    customElements.define(tagName, ZeusElement)
  }

  return ZeusElement
}
