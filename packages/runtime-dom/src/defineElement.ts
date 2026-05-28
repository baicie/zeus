// packages/runtime-dom/src/defineElement.ts

import { onScopeDispose, state } from '@zeus-js/signal'

import { createOwner, requestDOMContext, runWithOwner } from './context'
import { withHostContext } from './hostContext'
import { render } from './render'

import type { Context } from './context'
import type { HostRenderContext } from './hostContext'
import type { JSXValue } from './types'

export type ElementPropConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ObjectConstructor
  | ArrayConstructor

export type PropDefinition<T = unknown> =
  | ElementPropConstructor
  | {
      type?: ElementPropConstructor
      attr?: string | false
      reflect?: boolean
      default?: T | (() => T)
    }

export type PropOptions<P extends Record<string, unknown>> = Partial<{
  [K in keyof P]: PropDefinition<P[K]>
}>

export interface DefineElementOptions<P extends Record<string, unknown>> {
  shadow?: boolean | ShadowRootInit
  props?: PropOptions<P>
  styles?: string | string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  consumes?: Context<any>[]
}

export interface DefineElementContext<E extends HTMLElement = HTMLElement> {
  host: E
  emit: (name: string, detail?: unknown, options?: CustomEventInit) => boolean
}

export type DefineElementSetup<
  P extends Record<string, unknown>,
  E extends HTMLElement = HTMLElement,
> = (props: Readonly<P>, context: DefineElementContext<E>) => JSXValue

type NormalizedPropDefinition = {
  key: string
  attr: string | false
  type?: ElementPropConstructor
  reflect: boolean
  default?: unknown
}

export function defineElement<
  P extends Record<string, unknown> = Record<string, unknown>,
  E extends HTMLElement = HTMLElement,
>(
  tagName: string,
  options: DefineElementOptions<P>,
  setup: DefineElementSetup<P, E>,
): CustomElementConstructor {
  const propDefs = normalizePropDefinitions(options.props ?? {})
  const observedAttributes = propDefs
    .filter(def => def.attr !== false)
    .map(def => def.attr as string)

  class ZeusElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return observedAttributes
    }

    private readonly props = state({}) as P
    private dispose?: () => void
    private target?: Element | ShadowRoot
    private lightChildren: Node[] = []
    private capturedLightChildren = false
    private reflecting = false

    constructor() {
      super()

      applyPropDefaults(this.props as Record<string, unknown>, propDefs)
      definePropAccessors(this, this.props as Record<string, unknown>, propDefs)
    }

    connectedCallback(): void {
      if (this.dispose) return

      const shadow = options.shadow ?? false
      const mode = shadow ? 'shadow' : 'light'

      if (mode === 'light' && !this.capturedLightChildren) {
        this.lightChildren = Array.from(this.childNodes)
        this.capturedLightChildren = true
      }

      this.syncAttributesToProps(propDefs)

      // Create an owner and inject context values from the DOM tree.
      const owner = createOwner()

      for (const context of options.consumes ?? []) {
        const value = requestDOMContext(this, context as Context<unknown>)

        if (value !== undefined) {
          owner.provides.set(context.id, value)
        } else if (context.defaultValue !== undefined) {
          owner.provides.set(context.id, context.defaultValue)
        }
      }

      const target = this.resolveRenderTarget(shadow)

      const hostContext: HostRenderContext = {
        host: this,
        mode,
        lightChildren: this.lightChildren,
      }

      const setupContext: DefineElementContext<E> = {
        host: this as unknown as E,
        emit: (name, detail, eventOptions) => {
          return this.dispatchEvent(
            new CustomEvent(name, {
              bubbles: true,
              composed: true,
              cancelable: true,
              ...eventOptions,
              detail,
            }),
          )
        },
      }

      this.dispose = render(
        () =>
          runWithOwner(owner, () =>
            withHostContext(hostContext, () =>
              setup(this.props as Readonly<P>, setupContext),
            ),
          ),
        target,
        { owner },
      )

      mountStyles(target, options.styles)

      onScopeDispose(() => {
        this.dispose?.()
        this.dispose = undefined
      }, true)
    }

    disconnectedCallback(): void {
      this.dispose?.()
      this.dispose = undefined
    }

    attributeChangedCallback(
      name: string,
      oldValue: string | null,
      newValue: string | null,
    ): void {
      if (oldValue === newValue || this.reflecting) return

      const def = propDefs.find(item => item.attr === name)

      if (!def) return
      ;(this.props as Record<string, unknown>)[def.key] = castAttributeValue(
        newValue,
        def,
      )
    }

    private resolveRenderTarget(
      shadow: boolean | ShadowRootInit,
    ): Element | ShadowRoot {
      if (this.target) return this.target

      if (!shadow) {
        this.target = this
        return this.target
      }

      this.target = this.attachShadow(
        typeof shadow === 'object' ? shadow : { mode: 'open' },
      )

      return this.target
    }

    private syncAttributesToProps(
      defs: readonly NormalizedPropDefinition[],
    ): void {
      for (const def of defs) {
        if (def.attr === false) continue

        const value = this.getAttribute(def.attr)

        if (value !== null || def.type === Boolean) {
          ;(this.props as Record<string, unknown>)[def.key] =
            castAttributeValue(value, def)
        }
      }
    }

    _writePropFromProperty(key: string, value: unknown): void {
      const def = propDefs.find(item => item.key === key)

      ;(this.props as Record<string, unknown>)[key] = value

      if (def?.reflect && def.attr !== false) {
        this.reflecting = true

        try {
          reflectPropToAttribute(this, def, value)
        } finally {
          this.reflecting = false
        }
      }
    }
  }

  if (!customElements.get(tagName)) {
    customElements.define(tagName, ZeusElement)
  }

  return ZeusElement
}

function normalizePropDefinitions<P extends Record<string, unknown>>(
  props: PropOptions<P>,
): NormalizedPropDefinition[] {
  return Object.keys(props).map(key => {
    const input = props[key as keyof P]

    if (typeof input === 'function') {
      return {
        key,
        attr: toKebabCase(key),
        type: input as ElementPropConstructor,
        reflect: false,
      }
    }

    return {
      key,
      attr: input?.attr === undefined ? toKebabCase(key) : input.attr,
      type: input?.type,
      reflect: Boolean(input?.reflect),
      default: input?.default,
    }
  })
}

function applyPropDefaults(
  props: Record<string, unknown>,
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    if (!('default' in def)) continue

    const value =
      typeof def.default === 'function'
        ? (def.default as () => unknown)()
        : def.default

    props[def.key] = value
  }
}

function definePropAccessors(
  element: HTMLElement,
  props: Record<string, unknown>,
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    if (def.key in element) continue

    Object.defineProperty(element, def.key, {
      configurable: true,
      enumerable: true,
      get() {
        return props[def.key]
      },
      set(value: unknown) {
        ;(
          element as HTMLElement & {
            _writePropFromProperty: (key: string, value: unknown) => void
          }
        )._writePropFromProperty(def.key, value)
      },
    })
  }
}

function castAttributeValue(
  value: string | null,
  def: NormalizedPropDefinition,
): unknown {
  if (def.type === Boolean) {
    return value !== null
  }

  if (value === null) {
    return undefined
  }

  if (def.type === Number) {
    return Number(value)
  }

  if (def.type === Object || def.type === Array) {
    try {
      return JSON.parse(value)
    } catch {
      if (__DEV__) {
        console.warn(
          `[Zeus custom-element] Failed to parse JSON attribute "${def.attr}".`,
        )
      }

      return def.type === Array ? [] : {}
    }
  }

  return value
}

function reflectPropToAttribute(
  element: HTMLElement,
  def: NormalizedPropDefinition,
  value: unknown,
): void {
  if (def.attr === false) return

  if (def.type === Boolean) {
    if (value) {
      element.setAttribute(def.attr, '')
    } else {
      element.removeAttribute(def.attr)
    }

    return
  }

  if (value == null) {
    element.removeAttribute(def.attr)
    return
  }

  if (def.type === Object || def.type === Array) {
    element.setAttribute(def.attr, JSON.stringify(value))
    return
  }

  element.setAttribute(def.attr, String(value))
}

function mountStyles(
  target: Element | ShadowRoot,
  styles: string | string[] | undefined,
): void {
  if (!styles) return

  const list = Array.isArray(styles) ? styles : [styles]

  for (const css of list) {
    const style = document.createElement('style')
    style.textContent = css
    target.appendChild(style)
  }
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
