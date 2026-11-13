# @zeus-js/runtime-dom (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { Accessor } from '@zeus-js/signal'
import { PropsSource } from '@zeus-js/shared'

type JSXPrimitive = string | number | boolean | null | undefined
export type JSXValue = JSXPrimitive | Node | JSXValue[]
export type JSXGetter = () => JSXValue
export type Component<
  P extends Record<string, unknown> = Record<string, unknown>,
> = (props: P) => JSXValue
export type TemplateFactory<T extends Node = Node> = () => T
export type AttrValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | (() => string | number | boolean | null | undefined)
export type ClassValue =
  | string
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>
  | Array<ClassValue>
  | (() => ClassValue)
export type StyleValue =
  | string
  | null
  | undefined
  | Partial<CSSStyleDeclaration>
  | Record<string, string | number | null | undefined>
  | (() =>
      | string
      | null
      | undefined
      | Partial<CSSStyleDeclaration>
      | Record<string, string | number | null | undefined>)
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
  isSVG?: boolean,
  _isMathML?: boolean,
): TemplateFactory<T>

interface HmrBinding {
  id: number
  kind: string
  value: string
}
interface HmrPlan {
  version: number
  signature: string
  bindings: HmrBinding[]
}
interface HmrHotContext {
  on(event: string, callback: (data: unknown) => void): void
  off(event: string, callback: (data: unknown) => void): void
  invalidate(message: string): void
}
/** Compiler helper for literal cells. Never emitted by SSR or production. */
export declare function createHmrState(
  hot: HmrHotContext | undefined,
  filename: string,
  initial: HmrPlan,
): {
  read(id: number): string
  dispose(): void
}

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
  /**
   * Adopts compiler-planned server markup already inside `container` instead
   * of clearing it. Throws `ZEUS_HYDRATION_NO_MARKUP` when the container has
   * no hydration markers and the render produced client nodes.
   */
  hydrate?: boolean
  /** Receives every scoped `ZEUS_HYDRATION_*` diagnostic of this takeover. */
  onHydrationError?: (error: Error) => void
}
export declare function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options?: RenderOptions,
): () => void

type HydrationElementShape = {
  readonly tag: string
  readonly staticAttributes?: readonly (readonly [string, string])[]
  readonly childTags?: readonly string[]
}
type HydrationTextRegion = {
  readonly parent: Node
  readonly close: Comment
}
type AutoHydrationHandle = {
  readonly componentId?: number
  /** Adopts the server element behind `markerId` and validates its shape. */
  element(markerId: string, shape: HydrationElementShape): Element
  /** Adopts the server text behind `markerId`, comparing the initial value. */
  text(markerId: string, expected?: unknown): Text
  /** Bounds a dynamic children-expression value on the server. */
  textRegion(markerId: string): HydrationTextRegion
  /** Clears a children-expression range and mounts the client value. */
  mountText(region: HydrationTextRegion, render: () => unknown): void
  /** Clears a control-flow region and returns its end anchor. */
  region(markerId: string): Comment
  /** Consumes an invocation marker and adopts the child component. */
  child(markerId: string, render: () => unknown): void
  /** Validates the server-rendered `<slot>` element of a shadow custom element. */
  slot(markerId: string): void
  /** Runs dynamic-region mounting with component adoption disabled. */
  mount(run: () => void): void
  /** A server boundary that cannot be adopted (for example ErrorBoundary). */
  unsupported(markerId: string): never
}
/**
 * Compiler entry for one component. `adopt` reuses the server tree; `create`
 * is the ordinary client body. A scoped hydration failure clears the
 * component's server range, marks the rebuilt root, and runs `create` fresh.
 */
export declare function autoHydrateComponent(
  componentId: number,
  rootMarkerId: string,
  adopt: (handle: AutoHydrationHandle) => unknown,
  create: () => unknown,
): unknown

export interface HydrationContext {
  node(id: string, expectedTag?: string, occurrence?: number): Node
  nodes(id: string, expectedTag?: string): Node[]
  text(id: string, value: () => unknown, occurrence?: number): void
  attr(
    id: string,
    name: string,
    value: () => unknown,
    occurrence?: number,
  ): void
  prop(
    id: string,
    name: string,
    value: () => unknown,
    occurrence?: number,
  ): void
  event(
    id: string,
    name: string,
    handler: EventListener,
    occurrence?: number,
  ): void
}
export interface HydrationPlanBinding {
  readonly id: number
  readonly kind: 'text' | 'attr' | 'prop' | 'event' | 'spread'
  readonly name?: string
  readonly once: boolean
}
export interface HydrationPlanNode {
  readonly id: string
  readonly nodeId: number
  readonly kind:
    | 'root'
    | 'element'
    | 'text'
    | 'component'
    | 'show'
    | 'for'
    | 'transition'
    | 'region'
  readonly optional: boolean
  readonly tagName?: string
  readonly bindings: readonly HydrationPlanBinding[]
}
export interface HydrationPlanComponent {
  readonly id: number
  readonly templateId: string
  readonly nodes: readonly HydrationPlanNode[]
}
export interface HydrationPlan {
  readonly version: number
  readonly components: readonly HydrationPlanComponent[]
}
export type HydrationBindingHandler = (
  context: HydrationContext,
  binding: HydrationPlanBinding,
  node: HydrationPlanNode,
  occurrence: number,
) => void
/**
 * Reuses server-created nodes and attaches fine-grained bindings. This API is
 * intentionally explicit: compiler-generated plans can map each marker to a
 * precise node without guessing a component tree from arbitrary HTML.
 */
export declare function hydrate(
  container: Element | DocumentFragment,
  setup: (context: HydrationContext) => void,
): () => void
/**
 * Reconnects every compiler-planned binding to an existing DOM tree. Missing
 * handlers fail during setup and dispose the partial hydration scope.
 */
export declare function hydratePlan(
  container: Element | DocumentFragment,
  plan: HydrationPlan,
  handlers: Readonly<Record<number, HydrationBindingHandler>>,
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

export interface PortalProps {
  target: Element | DocumentFragment
  children?: JSXValue | (() => JSXValue)
}
/**
 * Mounts a Native JSX range into a target owned by the same document.
 *
 * The returned comment is the source-tree placeholder. Portal owns only the
 * target anchors and nodes inserted between them.
 */
export declare function Portal(props: PortalProps): Comment

export type ErrorBoundaryPhase =
  | 'render'
  | 'binding'
  | 'event'
  | 'request'
  | 'runtime'
export interface ErrorBoundaryInfo {
  readonly phase: ErrorBoundaryPhase
  readonly fatal: boolean
}
export type ErrorBoundaryHandler = (
  error: unknown,
  phase?: ErrorBoundaryPhase,
) => void
export declare function captureErrorBoundary(): ErrorBoundaryHandler | undefined
export declare function reportError(
  error: unknown,
  phase?: ErrorBoundaryPhase,
): void

export interface ErrorBoundaryProps {
  /** The child must be a factory so setup errors stay inside the boundary. */
  children: () => JSXValue
  fallback: (
    error: unknown,
    reset: () => void,
    info?: ErrorBoundaryInfo,
  ) => JSXValue
  onError?: (error: unknown, info?: ErrorBoundaryInfo) => void
}
declare const errorBoundaryIntrinsic: unique symbol
/** Marks the compiler intrinsic for JSX typing without changing its runtime identity. */
export declare const ErrorBoundary: typeof renderErrorBoundary & {
  readonly [errorBoundaryIntrinsic]: true
}
/**
 * Mounts an explicit-factory error boundary without introducing a wrapper node.
 * Compiler lowering may target this helper once boundary children are emitted
 * as factories automatically.
 */
declare function renderErrorBoundary(
  props: ErrorBoundaryProps,
): DocumentFragment

/** Values accepted by a native form or a form-associated custom element. */
export type FormValue = unknown
export type FormValues = Record<string, FormValue>
export type FormErrors = Readonly<Record<string, string>>
export interface FormSchemaContext {
  readonly form: HTMLFormElement | undefined
  readonly signal: AbortSignal
}
export interface FormSchemaResult<TValues extends FormValues> {
  values?: TValues
  errors?: FormErrors
}
export type FormSchema<TValues extends FormValues> = (
  values: Readonly<TValues>,
  context: FormSchemaContext,
) => FormSchemaResult<TValues> | Promise<FormSchemaResult<TValues>>
export interface SafeParseIssue {
  path?: readonly (string | number)[]
  message: string
}
export interface SafeParseSchema<TValues> {
  safeParse(input: unknown):
    | {
        success: true
        data: TValues
      }
    | {
        success: false
        error: {
          issues?: readonly SafeParseIssue[]
          message?: string
        }
      }
}
/** Adapt Zod, Valibot, or another safeParse-compatible schema without a dependency. */
export declare function fromSafeParse<TValues extends FormValues>(
  schema: SafeParseSchema<TValues>,
): FormSchema<TValues>
export interface FormSubmitContext {
  readonly form: HTMLFormElement | undefined
  readonly formData: FormData
  readonly signal: AbortSignal
}
export type FormSubmitResult<TValues extends FormValues> =
  | {
      status: 'success'
      values: TValues
    }
  | {
      status: 'invalid'
      values: TValues
      errors: FormErrors
    }
  | {
      status: 'error'
      values: TValues
      error: unknown
    }
  | {
      status: 'aborted'
      values: TValues
    }
export interface FormFieldController<TValue = FormValue> {
  readonly name: string
  readonly value: Accessor<TValue | undefined>
  readonly error: Accessor<string | undefined>
  readonly touched: Accessor<boolean>
  readonly dirty: Accessor<boolean>
  readonly invalid: Accessor<boolean>
  set(value: TValue): void
  touch(): void
  input(event: Event): void
  change(event: Event): void
  blur(event?: Event): void
  compositionStart(event?: CompositionEvent): void
  compositionEnd(event?: CompositionEvent): void
  reset(): void
}
export interface CreateFormOptions<TValues extends FormValues> {
  initialValues: TValues
  schema?: FormSchema<TValues>
  onSubmit?: (
    values: TValues,
    context: FormSubmitContext,
  ) => unknown | Promise<unknown>
  onError?: (error: unknown, context: FormSubmitContext) => void
}
export interface FormController<TValues extends FormValues> {
  readonly values: Accessor<TValues>
  readonly errors: Accessor<FormErrors>
  readonly touched: Accessor<Readonly<Record<string, boolean>>>
  readonly submitting: Accessor<boolean>
  readonly submitError: Accessor<unknown>
  readonly submitCount: Accessor<number>
  readonly valid: Accessor<boolean>
  readonly dirty: Accessor<boolean>
  readonly form: Accessor<HTMLFormElement | undefined>
  bind(form: HTMLFormElement): () => void
  field<TName extends keyof TValues & string>(
    name: TName,
  ): FormFieldController<TValues[TName]>
  setValue<TName extends keyof TValues & string>(
    name: TName,
    value: TValues[TName],
  ): void
  setError(name: string, message: string | undefined): void
  submit(event?: SubmitEvent | Event): Promise<FormSubmitResult<TValues>>
  handleSubmit(event: SubmitEvent | Event): void
  reset(): void
  handleReset(event?: Event): void
  formData(): FormData
  dispose(): void
}
/** Convert native FormData entries into a plain object, retaining repeated names. */
export declare function formDataToValues(formData: FormData): FormValues
export declare function createForm<TValues extends FormValues>(
  options: CreateFormOptions<TValues>,
): FormController<TValues>

export type TransitionPhase = 'enter' | 'leave'
export type TransitionClassValue = string | readonly string[]
export interface TransitionClassSpec {
  from?: TransitionClassValue
  active?: TransitionClassValue
  to?: TransitionClassValue
}
export interface TransitionContext {
  readonly nodes: readonly Node[]
  readonly phase: TransitionPhase
  done: () => void
  cancel: () => void
}
type TransitionCleanup = () => void
export type TransitionHookResult =
  | void
  | TransitionCleanup
  | Promise<void | TransitionCleanup>
/**
 * A hook with one argument receives a context. A two-argument hook receives
 * the nodes and a done callback, which is useful for callback-style animation
 * libraries. Returning a Promise is the async form of the same contract.
 */
export type TransitionHook =
  | ((context: TransitionContext) => TransitionHookResult)
  | ((nodes: readonly Node[], done: () => void) => TransitionHookResult)
export type TransitionSpec =
  | TransitionClassValue
  | TransitionClassSpec
  | TransitionHook
export type TransitionDuration =
  | number
  | PromiseLike<number>
  | (() => number | PromiseLike<number>)
export interface TransitionOptions {
  enter?: TransitionSpec
  leave?: TransitionSpec
  onEnter?: TransitionHook
  onLeave?: TransitionHook
  duration?:
    | TransitionDuration
    | {
        enter?: TransitionDuration
        leave?: TransitionDuration
      }
  onEnterDone?: () => void
  onLeaveDone?: () => void
  /** Skip visual hooks when the user agent requests reduced motion. */
  respectReducedMotion?: boolean
}
export interface TransitionHandle {
  readonly phase: TransitionPhase
  readonly promise: Promise<void>
  done: () => void
  cancel: () => void
  dispose: () => void
}
export interface TransitionProps extends TransitionOptions {
  when: unknown
  children?: JSXValue | (() => JSXValue)
  fallback?: JSXValue | (() => JSXValue)
}
type Complete = () => void
/**
 * Apply an enter or leave transition to an already mounted node range.
 *
 * A numeric duration is a timeout fallback. A Promise or Promise-returning
 * function is awaited. Callback hooks may call `done()` explicitly; calling
 * `done()` or `cancel()` more than once is harmless.
 */
export declare function transition(
  value: Node | readonly Node[],
  phase: TransitionPhase,
  options?: TransitionOptions,
  complete?: Complete,
): TransitionHandle
/**
 * Mount a reactive transition region. This is the runtime lowering boundary
 * used by the native compiler's `<Transition>` intrinsic.
 */
export declare function mountTransition(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  options?: TransitionOptions,
): void
/**
 * Runtime value form for explicit calls. JSX compilation of this boundary is
 * The compiler lowers the intrinsic form to `mountTransition`; direct calls
 * remain available for runtime-only integrations.
 */
export declare function Transition(props: TransitionProps): JSXValue

export declare function isWithinRuntimeDomMove(node: Node): boolean

export declare function marker(parent: ParentNode, index: number): Comment
export declare function child(parent: ParentNode, index: number): ChildNode
export declare function removeNodes(nodes: readonly Node[]): void

export declare function bindText(
  node: Text,
  value: () => JSXValue,
  once?: boolean,
): void
export declare function bindTextContent(
  el: Node,
  value: () => JSXValue,
  once?: boolean,
): void
export declare function setAttr(
  el: Element,
  name: string,
  value: AttrValue,
): void
export declare function bindAttr(
  el: Element,
  name: string,
  value: () => AttrValue,
  once?: boolean,
): void
export declare function bindProp<T extends Element, K extends keyof T>(
  el: T,
  name: K,
  value: () => T[K],
  once?: boolean,
): void
export declare function bindClass(
  el: Element,
  value: () => ClassValue,
  once?: boolean,
): void
export declare function normalizeClass(value: ClassValue): string
export declare function bindStyle(
  el: HTMLElement | SVGElement,
  value: () => StyleValue,
  once?: boolean,
): void

/**
 * Binds `handler` for `name` on `el`. Delegated handlers are dispatched by the
 * document listener registered through `delegateEvents`; pass
 * `delegated = false` for events that do not bubble or for modules compiled
 * without delegation, which attach a native listener on the element instead.
 */
export declare function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
  delegated?: boolean,
): void
/**
 * Registers one shared document listener per event type. These listeners are
 * process-wide and outlive any component, so runtime diagnostics sessions do
 * not count them; only per-element native listeners are counted.
 */
export declare function delegateEvents(events: readonly string[]): void

/**
 * Runs the ref target outside tracking.
 *
 * A ref callback is a mount hook, not a rendering expression: it runs when the
 * element it points at exists, and it must not re-run because something it
 * happened to read changed. Without this, a callback that seeds a field from a
 * signal (`ref={el => seed(el, draft().email)}`) makes the enclosing dynamic
 * region depend on `draft`, so every keystroke rebuilds the subtree that holds
 * the field. The rebuilt field is a new node, has no `dataset` marker, and is
 * seeded again from the stale value the render started with — the user's text
 * is lost, and a submit compares against the old value and sends `{}`.
 *
 * `untrack` rather than a manual flag: the read is a genuine read, it just must
 * not become an edge. Values the callback wants to publish must go through
 * signals it writes, which is unaffected.
 */
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
  render: (item: Accessor<T>, index: Accessor<number>) => JSXValue,
): void

export type CustomElementPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'unknown'
export interface CustomElementPropSchema {
  name: string
  attrName?: string | false
  type: CustomElementPropType
  reflect?: boolean
  serialize?: true | ((value: unknown) => string | null | undefined)
  deserialize?: true | ((value: string | null) => unknown)
}
/** A value already normalized at the host's input boundary. */
export interface NormalizedPropChange {
  name: string
  value: unknown
  source: 'property' | 'attribute'
  rawAttributeValue?: string | null
}
export interface CustomElementMount {
  readonly active: boolean
  dispose(): void
}
export interface CustomElementMountLifecycle<M extends CustomElementMount> {
  connect(): M
  disconnect(): void
  current(): M | undefined
}
export declare function getCustomElementAttributeName(
  prop: CustomElementPropSchema,
): string | undefined
export declare function getCustomElementObservedAttributes(
  props: readonly CustomElementPropSchema[],
): string[]
export declare function findCustomElementPropByAttribute(
  props: readonly CustomElementPropSchema[],
  attrName: string,
): CustomElementPropSchema | undefined
export declare function coerceCustomElementAttribute(
  prop: CustomElementPropSchema,
  value: string | null,
): unknown
export declare function reflectCustomElementProperty(
  element: HTMLElement,
  prop: CustomElementPropSchema,
  value: unknown,
  reflectingAttrs?: Set<string>,
): void
export declare function createCustomElementMountLifecycle<
  M extends CustomElementMount,
>(mount: () => M): CustomElementMountLifecycle<M>

export type ElementPropConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | ObjectConstructor
  | ArrayConstructor
  | FunctionConstructor
export type PropSerializer<T = unknown> = {
  bivarianceHack(value: T | undefined): string | null | undefined
}['bivarianceHack']
export type PropDeserializer<T = unknown> = {
  bivarianceHack(value: string | null): T | undefined
}['bivarianceHack']
export type PropReactivity = 'deep' | 'shallow'
export interface PropDefinitionOptions<T = unknown> {
  type?: ElementPropConstructor
  attr?: string | false
  reflect?: boolean
  reactivity?: PropReactivity
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
type ConstructorPropDefinition<
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
export type FormAssociatedValue = File | FormData | string | null
export type FormStateRestoreMode = 'restore' | 'autocomplete'
type ExplicitPropKeys<T> = keyof {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K]: T[K]
}
export type EmitApi<E extends EmitsOptions> = {
  [K in keyof E]: E[K] extends EventDefinition<infer Detail>
    ? (detail: Detail, options?: CustomEventInit) => boolean
    : never
}
export type PropOptions<P extends object> = Partial<{
  [K in ExplicitPropKeys<P>]: PropDefinition<P[K]>
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
      detailOptional?: string[]
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
  form?: FormAssociatedOptions<P, HTMLElement, E>
  props?: PropOptions<P>
  emits?: E
  styles?: string | string[]
  styleNonce?: string
  consumes?: Context<any>[]
  models?: readonly ElementModelDefinition<P>[]
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
export interface FormAssociatedOptions<
  P extends object,
  E extends HTMLElement = HTMLElement,
  Emits extends EmitsOptions = EmitsOptions,
> {
  value?: ExplicitPropKeys<P> | ((props: Readonly<P>) => FormAssociatedValue)
  state?: ExplicitPropKeys<P> | ((props: Readonly<P>) => FormAssociatedValue)
  associated?(
    form: HTMLFormElement | null,
    props: Readonly<P>,
    context: DefineElementContext<E, Emits>,
  ): void
  disabled?(
    disabled: boolean,
    props: Readonly<P>,
    context: DefineElementContext<E, Emits>,
  ): void
  reset?(props: Readonly<P>, context: DefineElementContext<E, Emits>): void
  stateRestore?(
    state: FormAssociatedValue,
    mode: FormStateRestoreMode,
    props: Readonly<P>,
    context: DefineElementContext<E, Emits>,
  ): void
}
export interface ElementModelDefinition<P extends object> {
  prop: ExplicitPropKeys<P>
  event: string
  eventPath?: string
}
export interface DefineElementContext<
  E extends HTMLElement = HTMLElement,
  Emits extends EmitsOptions = EmitsOptions,
> {
  host: E
  internals?: ElementInternals
  emit: EmitApi<Emits>
  expose(methods: Record<string, Function>): void
}
export type DefineElementSetup<
  P extends object,
  E extends HTMLElement = HTMLElement,
  Emits extends EmitsOptions = EmitsOptions,
> = (props: Readonly<P>, context: DefineElementContext<E, Emits>) => JSXValue
export type NormalizedPropDefinition = CustomElementPropSchema & {
  attrName: string | false
  reflect: boolean
  reactivity: PropReactivity
  default?: unknown
  serialize?: (value: unknown) => string | null | undefined
  deserialize?: (value: string | null) => unknown
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
export interface MountedElementDefinition extends CustomElementMount {
  propertyChanged(change: NormalizedPropChange): void
  formAssociated(form: HTMLFormElement | null): void
  formDisabled(disabled: boolean): void
  formReset(): void
  formStateRestore(state: FormAssociatedValue, mode: FormStateRestoreMode): void
}
export declare function prop<const V extends readonly string[]>(
  values: V,
  options?: Omit<PropDefinitionOptions<V[number]>, 'type' | 'values'>,
): ValuePropDefinition<V[number]>
export declare function prop(
  type: BooleanConstructor,
  options?: Omit<PropDefinitionOptions<boolean>, 'type' | 'values'>,
): ConstructorPropDefinition<boolean, BooleanConstructor>
export declare function prop<T = unknown>(
  type: Exclude<ElementPropConstructor, BooleanConstructor>,
  options?: Omit<PropDefinitionOptions<T>, 'type' | 'values'>,
): ConstructorPropDefinition<T>
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
  internals?: ElementInternals
  attributeProps?: Set<string>
  reflectingAttrs?: Set<string>
  exposedMethods?: Record<string, Function>
}
export declare function defineElement<
  P extends object = Record<string, unknown>,
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

export interface HostProps extends Record<string, unknown> {
  children?: JSXValue
  /**
   * Ref to current custom element host.
   */
  ref?: RefTarget<HTMLElement>
  /**
   * class and className both map to host class attribute.
   */
  class?: ClassValue
  className?: ClassValue
  /**
   * Inline style for host element.
   */
  style?: StyleValue
  /**
   * Common host attributes.
   */
  id?: AttrValue
  role?: AttrValue
  part?: AttrValue
  title?: AttrValue
  slot?: AttrValue
  tabIndex?: number | null | undefined | false
}
export interface SlotProps {
  name?: string
  children?: JSXValue
}
/** Runtime bridge used only by the compiler's Host boundary. */
export declare function Host(props: HostProps): JSXValue
export declare function Slot(props: SlotProps): JSXValue

export declare function createSlot(
  name?: string,
  fallback?: () => JSXValue,
): JSXValue
interface LightDomProjection {
  createSlot(name?: string, fallback?: () => JSXValue): DocumentFragment
  connect(): void
  disconnect(): void
}

export type HostRenderMode = 'light' | 'shadow'
export interface HostRenderContext {
  host: HTMLElement
  mode: HostRenderMode
  lightChildren: Node[]
  projection?: LightDomProjection
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

export declare function mergeProps<T extends object = Record<string, unknown>>(
  sources: readonly PropsSource[],
): T
export declare function bindSpread(
  el: Element,
  sources: readonly PropsSource[],
  onceSources?: readonly number[],
): void
```
