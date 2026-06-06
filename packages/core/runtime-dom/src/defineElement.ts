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
  | FunctionConstructor

export interface PropDefinitionOptions<T = unknown> {
  type?: ElementPropConstructor
  attr?: string | false
  reflect?: boolean
  default?: T | (() => T)
  values?: readonly T[]
}

export type PropDefinition<T = unknown> =
  | ElementPropConstructor
  | PropDefinitionOptions<T>

export interface ValuePropDefinition<
  T = unknown,
> extends PropDefinitionOptions<T> {
  type: StringConstructor
  values: readonly T[]
}

export interface EventDefinition<Detail = unknown> {
  __zeusEvent: true
  name?: string
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
  __detail?: Detail
}

export interface EventOptions {
  name?: string
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
}

export interface EmitsOptions {
  [key: string]: EventDefinition<unknown>
}

export type EmitApi<E extends EmitsOptions> = {
  [K in keyof E]: E[K] extends EventDefinition<infer Detail>
    ? (detail: Detail, options?: CustomEventInit) => boolean
    : never
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

  cssVars?: Record<string, { description?: string }>
  cssParts?: string[]

  [key: string]: unknown
}

export interface DefineElementOptions<
  P extends object,
  E extends EmitsOptions = EmitsOptions,
> {
  shadow?: boolean | ShadowRootInit
  formAssociated?: boolean
  props?: PropOptions<P>
  emits?: E
  styles?: string | string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  consumes?: Context<any>[]
  slots?: readonly string[]
  parts?: readonly string[]
  cssVars?: Record<string, { description?: string }>

  /**
   * Metadata only.
   * Runtime does not consume this field.
   */
  meta?: DefineElementMeta
}

export interface DefineElementContext<
  E extends HTMLElement = HTMLElement,
  Emits extends EmitsOptions = EmitsOptions,
> {
  host: E
  emit: EmitApi<Emits>
  expose(methods: Record<string, Function>): void
}

export type DefineElementSetup<
  P extends object,
  E extends HTMLElement = HTMLElement,
  Emits extends EmitsOptions = EmitsOptions,
> = (props: Readonly<P>, context: DefineElementContext<E, Emits>) => JSXValue

export type NormalizedPropDefinition = {
  key: string
  attr: string | false
  type?: ElementPropConstructor
  reflect: boolean
  default?: unknown
}

export const ZEUS_ELEMENT_DEFINITION = Symbol.for('zeus.element.definition')

export interface ZeusElementDefinition<
  P extends object = object,
  E extends HTMLElement = HTMLElement,
  Emits extends EmitsOptions = EmitsOptions,
> {
  tagName: string
  options: DefineElementOptions<P, Emits>
  setup: DefineElementSetup<P, E, Emits>
  propDefs: NormalizedPropDefinition[]
}

export type ZeusElementConstructor = CustomElementConstructor & {
  [ZEUS_ELEMENT_DEFINITION]?: ZeusElementDefinition
}

export interface MountedElementDefinition {
  propertyChanged(name: string, _oldValue: unknown, newValue: unknown): void
  dispose(): void
}

const DEFAULT_EVENT_OPTIONS = {
  bubbles: true,
  composed: true,
  cancelable: false,
}

export function prop<const V extends readonly string[]>(
  values: V,
  options: Omit<PropDefinitionOptions<V[number]>, 'type' | 'values'> = {},
): ValuePropDefinition<V[number]> {
  return {
    type: String,
    values,
    attr: options.attr,
    reflect: options.reflect,
    default: options.default,
  }
}

export function event<Detail = unknown>(): EventDefinition<Detail>
export function event<Detail = unknown>(name: string): EventDefinition<Detail>
export function event<Detail = unknown>(
  options: EventOptions,
): EventDefinition<Detail>
export function event<Detail = unknown>(
  input?: string | EventOptions,
): EventDefinition<Detail> {
  if (typeof input === 'string') {
    return {
      __zeusEvent: true,
      name: input,
    }
  }

  return {
    __zeusEvent: true,
    name: input?.name,
    bubbles: input?.bubbles,
    composed: input?.composed,
    cancelable: input?.cancelable,
  }
}

/**
 * Persisted mount state for a lazy-loaded element.
 * Used across disconnect/reconnect cycles to avoid re-capturing
 * light DOM children or re-attaching shadow roots.
 */
export interface ElementDefinitionMountState {
  target?: Element | ShadowRoot
  lightChildren?: Node[]
  capturedLightChildren?: boolean
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
  Emits extends EmitsOptions = EmitsOptions,
>(
  tagName: string,
  options: DefineElementOptions<P, Emits>,
  setup: DefineElementSetup<P, E, Emits>,
): CustomElementConstructor {
  const propDefs = normalizePropDefinitions(options.props ?? {})
  const definition: ZeusElementDefinition<P, E, Emits> = {
    tagName,
    options,
    setup,
    propDefs,
  }
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

      const setupContext: DefineElementContext<E, Emits> = {
        host: this as unknown as E,
        emit: createEmitApi(this, options.emits) as EmitApi<Emits>,
        expose: createExpose(this),
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

  Object.defineProperty(ZeusElement, ZEUS_ELEMENT_DEFINITION, {
    value: definition,
    configurable: false,
  })

  return ZeusElement
}

export function getElementDefinition(
  ctor: CustomElementConstructor,
): ZeusElementDefinition {
  const definition = (ctor as ZeusElementConstructor)[ZEUS_ELEMENT_DEFINITION]

  if (!definition) {
    throw new Error('[zeus] Element definition metadata not found.')
  }

  return definition
}

export function mountElementDefinition(
  ctor: CustomElementConstructor,
  host: HTMLElement,
  initialValues: Map<string, unknown> = new Map(),
  mountState: ElementDefinitionMountState = {},
): MountedElementDefinition {
  const definition = getElementDefinition(ctor)
  const { options, setup, propDefs } = definition
  const propStore = createPropStore(propDefs)

  applyPropDefaults(propStore, propDefs)

  for (const def of propDefs) {
    if (initialValues.has(def.key)) {
      propStore.set(def.key, initialValues.get(def.key))
      continue
    }

    /**
     * Sync real definition defaults (e.g. factory defaults like `default: () => []`)
     * back to the lazy host value map so that `element.propName` returns the
     * correct default value rather than undefined.
     */
    initialValues.set(def.key, propStore.get(def.key))
  }

  const shadow = options.shadow ?? false
  const mode = shadow ? 'shadow' : 'light'

  if (mode === 'light' && !mountState.capturedLightChildren) {
    mountState.lightChildren = Array.from(host.childNodes)
    mountState.capturedLightChildren = true
  }

  const lightChildren = mountState.lightChildren ?? []

  const owner = createOwner()

  for (const context of options.consumes ?? []) {
    const resolved = resolveDOMContext(host, context as Context<unknown>)

    if (resolved.found) {
      owner.provides.set(context.id, resolved.value)
    } else if (context.hasDefaultValue) {
      owner.provides.set(context.id, context.defaultValue)
    }
  }

  const target =
    mountState.target ??
    (mountState.target = resolveExternalRenderTarget(host, shadow))

  const hostContext: HostRenderContext = {
    host,
    mode,
    lightChildren,
  }

  const setupContext: DefineElementContext<HTMLElement> = {
    host,
    emit: createEmitApi(host, options.emits) as EmitApi<EmitsOptions>,
    expose: createExpose(host),
  }

  const dispose = render(
    () =>
      runWithOwner(owner, () =>
        withHostContext(hostContext, () =>
          setup(propStore.props, setupContext),
        ),
      ),
    target,
    { owner },
  )

  mountStyles(target, options.styles)

  return {
    propertyChanged(name, _oldValue, newValue) {
      propStore.set(name, newValue)
    },

    dispose() {
      dispose()
    },
  }
}

function normalizePropDefinitions<P extends Record<string, unknown>>(
  props: PropOptions<P>,
): NormalizedPropDefinition[] {
  return Object.keys(props).map(key => {
    const input = props[key as keyof P]

    if (typeof input === 'function') {
      const type = input as ElementPropConstructor

      return {
        key,
        attr: isAttributeBackedConstructor(type) ? toKebabCase(key) : false,
        type,
        reflect: false,
      }
    }

    const type = input?.type
    const defaultAttr = isAttributeBackedConstructor(type)
      ? toKebabCase(key)
      : false

    return {
      key,
      attr: input?.attr === undefined ? defaultAttr : input.attr,
      type,
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

  if (def.type === Function) {
    return undefined
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

  if (def.type === Function) return

  element.setAttribute(def.attr, String(value))
}

function createEmitApi(
  host: HTMLElement,
  emits: EmitsOptions | undefined,
): EmitApi<EmitsOptions> {
  const emit: EmitApi<EmitsOptions> = {}

  const dispatch = (
    name: string,
    detail?: unknown,
    options?: CustomEventInit,
  ): boolean => {
    const eventName = resolveEventName(name, emits)
    const eventOptions = resolveEventOptions(name, emits, options)

    return host.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: eventOptions.bubbles,
        composed: eventOptions.composed,
        cancelable: eventOptions.cancelable,
        detail,
      }),
    )
  }

  if (emits) {
    for (const key of Object.keys(emits)) {
      Object.defineProperty(emit, key, {
        configurable: true,
        enumerable: true,
        value(detail: unknown, options?: CustomEventInit): boolean {
          return dispatch(key, detail, options)
        },
      })
    }
  }

  return emit
}

function createExpose(
  host: HTMLElement,
): (methods: Record<string, Function>) => void {
  return methods => {
    for (const key of Object.keys(methods)) {
      Object.defineProperty(host, key, {
        configurable: true,
        enumerable: false,
        value: methods[key],
      })
    }
  }
}

function resolveEventName(
  name: string,
  emits: EmitsOptions | undefined,
): string {
  const definition = emits?.[name]

  return definition?.name ?? toKebabCase(name)
}

function resolveEventOptions(
  name: string,
  emits: EmitsOptions | undefined,
  options: CustomEventInit | undefined,
): Required<Pick<CustomEventInit, 'bubbles' | 'composed' | 'cancelable'>> {
  const definition = emits?.[name]

  return {
    bubbles:
      options?.bubbles ?? definition?.bubbles ?? DEFAULT_EVENT_OPTIONS.bubbles,
    composed:
      options?.composed ??
      definition?.composed ??
      DEFAULT_EVENT_OPTIONS.composed,
    cancelable:
      options?.cancelable ??
      definition?.cancelable ??
      DEFAULT_EVENT_OPTIONS.cancelable,
  }
}

function isAttributeBackedConstructor(
  type: ElementPropConstructor | undefined,
): boolean {
  return type === String || type === Number || type === Boolean
}

function resolveExternalRenderTarget(
  host: HTMLElement,
  shadow: boolean | ShadowRootInit,
): Element | ShadowRoot {
  if (!shadow) {
    return host
  }

  return (
    host.shadowRoot ??
    host.attachShadow(typeof shadow === 'object' ? shadow : { mode: 'open' })
  )
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
