# @zeus-js/runtime-dom (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
type JSXPrimitive = string | number | boolean | null | undefined
export type JSXValue = JSXPrimitive | Node | JSXValue[]
export type JSXGetter = () => JSXValue
export type Component<
  P extends Record<string, unknown> = Record<string, unknown>,
> = (props: P) => JSXValue
export type TemplateFactory<T extends Node = Node> = () => T
export type AttrValue = string | number | boolean | null | undefined
export type ClassValue =
  | string
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>
  | Array<ClassValue>
export type StyleValue =
  | string
  | null
  | undefined
  | Partial<CSSStyleDeclaration>
  | Record<string, string | number | null | undefined>
export type RefTarget<T> =
  | ((value: T | null) => void)
  | {
      value: T | null
    }
  | {
      current: T | null
    }

export declare function template<T extends Node = Node>(
  html: string,
  _isImportNode?: boolean,
  _isSVG?: boolean,
  _isMathML?: boolean,
): TemplateFactory<T>

export type ContextId = symbol
export interface Context<T = unknown> {
  readonly id: ContextId
  /**
   * The default value passed to createContext().
   *
   * Note:
   * - `defaultValue` itself may be `undefined`.
   * - Use `hasDefaultValue` to check whether a default value was provided.
   */
  readonly defaultValue: T | undefined
  readonly hasDefaultValue: boolean
  readonly Provider: ContextProvider<T>
  readonly Bridge: ContextBridge<T>
}
export interface ContextProviderProps<T> {
  value: T
  children?: JSXValue | (() => JSXValue)
  /**
   * When true, creates a DOM context boundary for native custom elements /
   * Web Components that live outside the Zeus owner tree.
   */
  bridge?: boolean
}
export interface ContextBridgeProps<T> {
  value: T
  children?: JSXValue | (() => JSXValue)
}
type ContextProvider<T> = (props: ContextProviderProps<T>) => JSXValue
type ContextBridge<T> = (props: ContextBridgeProps<T>) => JSXValue
export interface Owner {
  parent?: Owner
  provides: Map<ContextId, unknown>
}
export declare function getCurrentOwner(): Owner | undefined
export declare function createOwner(parent?: Owner | undefined): Owner
export declare function runWithOwner<T>(
  owner: Owner | undefined,
  fn: () => T,
): T
export declare function createContext<T>(): Context<T>
export declare function createContext<T>(defaultValue: T): Context<T>
export declare function provide<T>(context: Context<T>, value: T): void
export declare function inject<T>(context: Context<T>): T
export declare function inject<T>(context: Context<T>, fallback: T): T
export declare function useContext<T>(context: Context<T>): T
export declare function useContext<T>(context: Context<T>, fallback: T): T
export declare const ZEUS_CONTEXT_REQUEST = 'zeus:context-request'
export interface ZeusContextRequestDetail<T = unknown> {
  id: ContextId
  resolved: boolean
  value?: T
  resolve: (value: T) => void
}
export type ZeusContextRequestEvent<T = unknown> = CustomEvent<
  ZeusContextRequestDetail<T>
>
export interface DOMContextResolution<T> {
  found: boolean
  value: T | undefined
}
/**
 * Creates a transparent DOM element that acts as a context boundary.
 * Native custom elements inside it can use `resolveDOMContext` to receive
 * context values via the DOM event protocol.
 */
export declare function createDOMContextBoundary<T>(
  context: Context<T>,
  value: T,
  children: JSXValue,
): Element
/**
 * Registers a context value on a DOM target so that any descendant custom
 * element can pick it up via `resolveDOMContext`.
 */
export declare function provideDOMContext<T>(
  target: EventTarget,
  context: Context<T>,
  value: T,
): void
/**
 * Internal precise DOM context resolver.
 *
 * The result distinguishes:
 * - found: false, value: undefined
 * - found: true, value: undefined
 */
export declare function resolveDOMContext<T>(
  host: HTMLElement,
  context: Context<T>,
): DOMContextResolution<T>

export interface RenderOptions {
  owner?: ReturnType<typeof createOwner>
}
export declare function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options?: RenderOptions,
): () => void

export declare function insertTracked(
  parent: Node,
  value: JSXValue,
  marker?: Node | null,
): Node[]

export declare function insert(
  parent: Node,
  value: JSXValue,
  marker?: Node | null,
): void
export declare function mountDynamic(
  parent: Node,
  marker: Node,
  value: () => JSXValue,
): void

export declare function marker(parent: ParentNode, index: number): Comment
export declare function child(parent: ParentNode, index: number): ChildNode
export declare function removeNodes(nodes: readonly Node[]): void

export declare function bindText(node: Text, value: () => JSXValue): void
export declare function bindTextContent(el: Node, value: () => JSXValue): void
export declare function setAttr(
  el: Element,
  name: string,
  value: AttrValue,
): void
export declare function bindAttr(
  el: Element,
  name: string,
  value: () => AttrValue,
): void
export declare function bindProp<T extends Element, K extends keyof T>(
  el: T,
  name: K,
  value: () => T[K],
): void
export declare function bindClass(el: Element, value: () => ClassValue): void
export declare function normalizeClass(value: ClassValue): string
export declare function bindStyle(
  el: HTMLElement | SVGElement,
  value: () => StyleValue,
): void

export declare function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void
export declare function delegateEvents(events: readonly string[]): void

export declare function setRef<T>(
  target: RefTarget<T> | null | undefined,
  value: T | null,
): void
export declare function bindRef<T extends Element>(
  el: T,
  target: RefTarget<T> | null | undefined,
): void

export declare function createComponent<
  P extends Record<string, unknown>,
  R extends JSXValue,
>(component: (props: P) => R, props: P): R

export type ShowProps = {
  when: unknown
  fallback?: JSXValue | (() => JSXValue)
  children?: JSXValue | (() => JSXValue)
}
export declare function Show(props: ShowProps): JSXValue
export declare function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue
export declare function mountShow(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  fallback?: () => JSXValue,
): void
export type ForProps<T, K = unknown> = {
  each: readonly T[] | null | undefined
  by?: (item: T, index: number) => K
  children: (item: T, index: number) => JSXValue
}
export declare function For<T, K = unknown>(props: ForProps<T, K>): JSXValue
export declare function mountFor<T, K = unknown>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: T, index: number) => JSXValue,
): void

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
  cssVars?: Record<
    string,
    {
      description?: string
    }
  >
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
  consumes?: Context<any>[]
  slots?: readonly string[]
  parts?: readonly string[]
  cssVars?: Record<
    string,
    {
      description?: string
    }
  >
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
export declare const ZEUS_ELEMENT_DEFINITION: unique symbol
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
export declare function prop<const V extends readonly string[]>(
  values: V,
  options?: Omit<PropDefinitionOptions<V[number]>, 'type' | 'values'>,
): ValuePropDefinition<V[number]>
export declare function event<Detail = unknown>(): EventDefinition<Detail>
export declare function event<Detail = unknown>(
  name: string,
): EventDefinition<Detail>
export declare function event<Detail = unknown>(
  options: EventOptions,
): EventDefinition<Detail>
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
export declare function defineElement<
  P extends object = object,
  E extends HTMLElement = HTMLElement,
  Emits extends EmitsOptions = EmitsOptions,
>(
  tagName: string,
  options: DefineElementOptions<P, Emits>,
  setup: DefineElementSetup<P, E, Emits>,
): CustomElementConstructor
export declare function getElementDefinition(
  ctor: CustomElementConstructor,
): ZeusElementDefinition
export declare function mountElementDefinition(
  ctor: CustomElementConstructor,
  host: HTMLElement,
  initialValues?: Map<string, unknown>,
  mountState?: ElementDefinitionMountState,
): MountedElementDefinition

type HostValue<T> = T | (() => T)
export interface HostProps extends Record<string, unknown> {
  children?: JSXValue | (() => JSXValue)
  /**
   * Ref to current custom element host.
   */
  ref?: RefTarget<HTMLElement>
  /**
   * class and className both map to host class attribute.
   */
  class?: HostValue<ClassValue>
  className?: HostValue<ClassValue>
  /**
   * Inline style for host element.
   */
  style?: HostValue<StyleValue>
  /**
   * Common host attributes.
   */
  id?: HostValue<AttrValue>
  role?: HostValue<AttrValue>
  part?: HostValue<AttrValue>
  title?: HostValue<AttrValue>
  slot?: HostValue<AttrValue>
  tabIndex?: HostValue<number | null | undefined | false>
}
export interface SlotProps {
  name?: string
  children?: JSXValue | (() => JSXValue)
}
export declare function Host(props: HostProps): JSXValue
export declare function Slot(props: SlotProps): JSXValue

export declare function createSlot(
  name?: string,
  fallback?: () => JSXValue,
): JSXValue

export type HostRenderMode = 'light' | 'shadow'
export interface HostRenderContext {
  host: HTMLElement
  mode: HostRenderMode
  lightChildren: readonly Node[]
}
export declare function getCurrentHostContext(): HostRenderContext | undefined
export declare function withHostContext<T>(
  context: HostRenderContext | undefined,
  fn: () => T,
): T
export declare function captureCurrentHostContext():
  | HostRenderContext
  | undefined
export declare function withCapturedHostContext<
  T extends (...args: never[]) => unknown,
>(fn: T): T
```
