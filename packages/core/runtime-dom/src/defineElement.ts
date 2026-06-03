// packages/runtime-dom/src/defineElement.ts

import { state } from '@zeus-js/signal'

import { createOwner, resolveDOMContext, runWithOwner } from './context'
import { withHostContext } from './hostContext'
import { render } from './render'

import type { Context } from './context'
import type { HostRenderContext } from './hostContext'
import type { JSXValue } from './types'
import type { ValueState } from '@zeus-js/signal'

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

export type PropOptions<P extends object> = Partial<{
  [K in keyof P]: PropDefinition<P[K]>
}>

export interface DefineElementMeta {
  description?: string

  props?: Record<
    string,
    {
      description?: string
      category?: string
      docs?: string
    }
  >

  events?: Record<
    string,
    {
      description?: string
      detail?: Record<string, string>
    }
  >

  slots?: Record<
    string,
    {
      description?: string
    }
  >

  cssVars?: string[]
  cssParts?: string[]

  [key: string]: unknown
}

export interface DefineElementOptions<P extends object> {
  shadow?: boolean | ShadowRootInit
  props?: PropOptions<P>
  styles?: string | string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  consumes?: Context<any>[]

  /**
   * Metadata only.
   * Runtime does not consume this field.
   */
  meta?: DefineElementMeta
}

export interface DefineElementContext<E extends HTMLElement = HTMLElement> {
  host: E
  emit: (name: string, detail?: unknown, options?: CustomEventInit) => boolean
}

export type DefineElementSetup<
  P extends object,
  E extends HTMLElement = HTMLElement,
> = (props: Readonly<P>, context: DefineElementContext<E>) => JSXValue

type NormalizedPropDefinition = {
  key: string
  attr: string | false
  type?: ElementPropConstructor
  reflect: boolean
  default?: unknown
}

interface PropStore<P extends object> {
  readonly props: Readonly<P>
  get(key: string): unknown
  set(key: string, value: unknown): void
  has(key: string): boolean
}

function createPropStore<P extends object>(
  defs: readonly NormalizedPropDefinition[],
): PropStore<P> {
  const slots = new Map<string, ValueState<unknown>>()
  const props: Record<string, unknown> = {}

  for (const def of defs) {
    const slot = state<unknown>() as ValueState<unknown>
    slots.set(def.key, slot)

    Object.defineProperty(props, def.key, {
      configurable: false,
      enumerable: true,
      get() {
        return slot.value
      },
      set(value: unknown) {
        slot.value = value
      },
    })
  }

  return {
    props: props as Readonly<P>,

    get(key: string): unknown {
      return slots.get(key)?.value
    },

    set(key: string, value: unknown): void {
      const slot = slots.get(key)

      if (!slot) {
        if (__DEV__) {
          console.warn(
            `[Zeus custom-element] Unknown prop "${key}" was written.`,
          )
        }
        return
      }

      slot.value = value
    },

    has(key: string): boolean {
      return slots.has(key)
    },
  }
}

export function defineElement<
  P extends object = object,
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

    private readonly propStore: PropStore<P>
    private readonly props: Readonly<P>
    private dispose?: () => void
    private target?: Element | ShadowRoot
    private lightChildren: Node[] = []
    private capturedLightChildren = false
    private reflecting = false

    constructor() {
      super()

      this.propStore = createPropStore<P>(propDefs)
      this.props = this.propStore.props

      applyPropDefaults(this.propStore, propDefs)
      definePropAccessors(this, this.propStore, propDefs)
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
        const resolved = resolveDOMContext(this, context as Context<unknown>)

        if (resolved.found) {
          owner.provides.set(context.id, resolved.value)
        } else if (context.hasDefaultValue) {
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
      this.propStore.set(def.key, castAttributeValue(newValue, def))
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
          this.propStore.set(def.key, castAttributeValue(value, def))
        }
      }
    }

    _writePropFromProperty(key: string, value: unknown): void {
      const def = propDefs.find(item => item.key === key)

      this.propStore.set(key, value)

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

function applyPropDefaults<P extends object>(
  store: PropStore<P>,
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    if (!('default' in def)) continue

    const value =
      typeof def.default === 'function'
        ? (def.default as () => unknown)()
        : def.default

    store.set(def.key, value)
  }
}

function definePropAccessors<P extends object>(
  element: HTMLElement,
  store: PropStore<P>,
  defs: readonly NormalizedPropDefinition[],
): void {
  for (const def of defs) {
    const key = def.key
    const hadOwnValue = Object.prototype.hasOwnProperty.call(element, key)
    const ownValue = hadOwnValue
      ? (element as HTMLElement & Record<string, unknown>)[key]
      : undefined

    if (hadOwnValue) {
      delete (element as HTMLElement & Record<string, unknown>)[key]
    }

    const existing = Object.getOwnPropertyDescriptor(element, key)

    if (existing && existing.configurable === false) {
      if (__DEV__) {
        console.warn(
          `[Zeus custom-element] Cannot define prop "${key}" because an own non-configurable property already exists.`,
        )
      }
      continue
    }

    Object.defineProperty(element, key, {
      configurable: true,
      enumerable: true,
      get() {
        return store.get(key)
      },
      set(value: unknown) {
        ;(
          element as HTMLElement & {
            _writePropFromProperty: (key: string, value: unknown) => void
          }
        )._writePropFromProperty(key, value)
      },
    })

    if (hadOwnValue) {
      ;(
        element as HTMLElement & {
          _writePropFromProperty: (key: string, value: unknown) => void
        }
      )._writePropFromProperty(key, ownValue)
    }
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
