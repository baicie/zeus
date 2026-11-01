/**
 * Server counterparts of the `prop()` and `event()` declaration helpers.
 *
 * `defineElement()` on the server reads the same `props` schema the browser
 * uses, so a module that declares its schema with these helpers compiles to
 * the SSR target without importing `@zeus-js/runtime-dom`. They are pure data
 * constructors: no DOM element or custom-element registry is touched.
 */

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
  reactivity?: 'deep' | 'shallow'
  default?: T | (() => T)
  values?: readonly T[]
  serialize?(value: T | undefined): string | null | undefined
  deserialize?(value: string | null): T | undefined
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

export type ConstructorPropDefinition<
  T = unknown,
  C extends ElementPropConstructor = ElementPropConstructor,
> = PropDefinitionOptions<T> & {
  type: C
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

export function prop<const V extends readonly string[]>(
  values: V,
  options?: Omit<PropDefinitionOptions<V[number]>, 'type' | 'values'>,
): ValuePropDefinition<V[number]>
export function prop(
  type: BooleanConstructor,
  options?: Omit<PropDefinitionOptions<boolean>, 'type' | 'values'>,
): ConstructorPropDefinition<boolean, BooleanConstructor>
export function prop<T = unknown>(
  type: Exclude<ElementPropConstructor, BooleanConstructor>,
  options?: Omit<PropDefinitionOptions<T>, 'type' | 'values'>,
): ConstructorPropDefinition<T>
export function prop(
  input: ElementPropConstructor | readonly string[],
  options: Omit<PropDefinitionOptions, 'type' | 'values'> = {},
): ConstructorPropDefinition | ValuePropDefinition {
  if (Array.isArray(input)) {
    return {
      type: String,
      values: input,
      attr: options.attr,
      reflect: options.reflect,
      reactivity: options.reactivity,
      default: options.default,
      serialize: options.serialize,
      deserialize: options.deserialize,
    }
  }

  const type = input as ElementPropConstructor

  return {
    type,
    attr: options.attr,
    // Mirrors the DOM helper so a schema shared by both targets resolves the
    // same host attributes on the server.
    reflect: type === Boolean ? (options.reflect ?? true) : options.reflect,
    reactivity: options.reactivity,
    default: type === Boolean ? (options.default ?? false) : options.default,
    serialize: options.serialize,
    deserialize: options.deserialize,
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
