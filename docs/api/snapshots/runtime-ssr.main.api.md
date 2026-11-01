# @zeus-js/runtime-ssr (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export {
  Accessor,
  Setter,
  batch,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
} from '@zeus-js/signal'
import { PropsSource } from '@zeus-js/shared'

export type SSRPrimitive = string | number | boolean | null | undefined
declare const SSR_FRAGMENT: unique symbol
export interface SSRFragment {
  readonly [SSR_FRAGMENT]: true
  readonly html: string
  /** Internal root-node metadata used by Light DOM slot projection. */
  readonly slotName?: string
}
export type SSRNode = SSRPrimitive | SSRFragment | readonly SSRNode[]
export type SSRComponent<
  P extends Record<string, unknown> = Record<string, unknown>,
> = (props: P) => SSRNode
export interface SSRAttribute {
  readonly name: string
  readonly value: string | true
}
export type SSRAttributeValue = string | number | boolean | null | undefined
export type SSRAttributeEntry = SSRAttribute | null | undefined | false
export type SSRClassValue =
  | string
  | null
  | undefined
  | false
  | Readonly<Record<string, boolean | null | undefined>>
  | readonly SSRClassValue[]
export type SSRStyleValue =
  | string
  | null
  | undefined
  | Readonly<Record<string, string | number | null | undefined>>
export type SSRRenderInput = () => SSRNode
export interface SSRShadowRootOptions {
  readonly mode: 'open' | 'closed'
  readonly delegatesFocus?: boolean
  readonly serializable?: boolean
}
export interface SSRCustomElementOptions {
  readonly attributes?: readonly SSRAttributeEntry[]
  readonly children?: SSRNode
  readonly shadowRoot?: SSRNode
  readonly shadowRootOptions?: SSRShadowRootOptions
}
/** The JSON-safe subset of a generated Component Manifest consumed by SSR. */
export interface SSRManifestProp {
  readonly type?: string | Function
  readonly attr?: string | false
  readonly default?: unknown
  readonly hasDefault?: boolean
  readonly defaultStrategy?: 'static' | 'factory'
  readonly reflect?: boolean
}
export interface SSRManifestComponent {
  readonly tag: string
  readonly props?: Readonly<Record<string, SSRManifestProp>>
  readonly hostAttributes?: readonly string[]
  readonly meta?: {
    readonly shadow?: boolean
    readonly formAssociated?: boolean
    readonly [key: string]: unknown
  }
}
export interface SSRComponentManifest {
  readonly schemaVersion?: number
  readonly components: readonly SSRManifestComponent[]
}
export interface SSRDefineElementOptions {
  readonly shadow?: boolean | SSRShadowRootOptions
  readonly formAssociated?: boolean
  readonly props?: Readonly<Record<string, SSRManifestProp | Function>>
  readonly styles?: string | readonly string[]
}

export declare function renderToString(input: SSRRenderInput): string

export declare function ssrStatic(html: string): SSRFragment
export declare function ssrText(value: SSRNode): SSRFragment

/**
 * Serializes one element. `rawText` overrides the default HTML raw-text policy
 * for `<script>` and `<style>`: the compiler passes `false` when the element
 * sits in SVG foreign content, where those tags are parsed as normal elements
 * and CSS escapes are not honored.
 */
export declare function ssrElement(
  tag: string,
  attributes?: readonly SSRAttributeEntry[],
  children?: SSRNode,
  isVoid?: boolean,
  rawText?: boolean,
): SSRFragment
export declare function ssrAttr(
  name: string,
  value: SSRAttributeValue | SSRClassValue | SSRStyleValue,
): SSRAttributeEntry
export declare function ssrProp(name: string, value: unknown): SSRAttributeEntry

export declare function ssrComponent<
  P extends Record<string, unknown>,
  R extends SSRNode,
>(component: (props: P) => R, props: P): R

/**
 * Yields the serialized HTML of one node in pieces of at least `flushAt`
 * characters.
 *
 * Escaping runs before chunking, so a chunk never contains an unescaped value
 * or a half-applied raw-text rewrite. A single node larger than `flushAt` is
 * split into equal pieces: chunks are transport units of one byte stream, so a
 * consumer must concatenate them before parsing. `Infinity` yields exactly one
 * piece.
 */
export declare function serializeSSRNodeChunks(
  value: SSRNode,
  flushAt: number,
): Generator<string, void, undefined>

export type SSRResolvable<T> = T | (() => T)
export interface ShowProps {
  when: unknown
  fallback?: SSRResolvable<SSRNode>
  children?: SSRResolvable<SSRNode>
}
export declare function ssrShow(
  when: SSRResolvable<unknown>,
  children: SSRResolvable<SSRNode>,
  fallback?: SSRResolvable<SSRNode>,
): SSRNode
export declare function Show(props: ShowProps): SSRNode
export interface ForProps<T, K = unknown> {
  each: readonly T[] | null | undefined
  by?: (item: T, index: number) => K
  children: (item: T, index: number) => SSRNode
}
export declare function ssrFor<T>(
  each: SSRResolvable<readonly T[] | null | undefined>,
  render: (item: T, index: number) => SSRNode,
): SSRNode
export declare function For<T, K = unknown>(props: ForProps<T, K>): SSRNode

export declare function mergeProps<T extends object = Record<string, unknown>>(
  sources: readonly PropsSource[],
): T
export declare function ssrSpread(
  sources: readonly PropsSource[],
): SSRAttributeEntry[]

/** Emits a stable, comment-only marker consumed by the opt-in DOM hydrator. */
export declare function ssrHydrationMarker(id: string): SSRFragment
/**
 * Serializes a custom-element host and, when requested, a Declarative Shadow
 * DOM template. The runtime never registers a custom element during SSR.
 */
export declare function ssrCustomElement(
  tag: string,
  options?: SSRCustomElementOptions,
): SSRFragment
/**
 * Renders a custom element definition in a server-only environment. The
 * setup function is evaluated once and never registers a browser element.
 */
export declare function defineElement<P extends Record<string, unknown>>(
  tag: string,
  options: SSRDefineElementOptions | undefined,
  setup: (props: Readonly<P>, context: SSRDefineElementContext) => SSRNode,
): (props?: P) => SSRFragment
export interface SSRDefineElementContext {
  readonly host: undefined
  readonly internals: undefined
  readonly emit: (...args: unknown[]) => boolean
  readonly expose: (methods: Record<string, Function>) => void
}
/** Compiler intrinsic for a custom-element host boundary. */
export declare function Host(props?: Record<string, unknown>): SSRNode
/** Compiler intrinsic for shadow slots and light-DOM default projection. */
export declare function Slot(props?: {
  name?: string
  children?: SSRNode
}): SSRNode
/** Applies generated manifest defaults and primitive host-attribute policy. */
export declare function ssrComponentFromManifest<
  P extends Record<string, unknown>,
>(
  manifest: SSRComponentManifest,
  tag: string,
  props?: P,
  setup?: (props: Readonly<P>) => SSRNode,
): SSRFragment

export type ContextId = symbol
export interface SSRContextProviderProps<T> {
  value: T
  children?: SSRNode | (() => SSRNode)
  /**
   * Accepted for parity with the DOM runtime. SSR has no DOM boundary to
   * create, so the server renders the children in the same owner tree.
   */
  bridge?: boolean
}
export interface SSRContextBridgeProps<T> {
  value: T
  children?: SSRNode | (() => SSRNode)
}
export interface SSRContext<T = unknown> {
  readonly id: ContextId
  readonly defaultValue: T | undefined
  readonly hasDefaultValue: boolean
  readonly Provider: (props: SSRContextProviderProps<T>) => SSRNode
  readonly Bridge: (props: SSRContextBridgeProps<T>) => SSRNode
}
export interface SSROwner {
  parent?: SSROwner
  provides: Map<ContextId, unknown>
  disposed?: boolean
}
export declare function getSSRCurrentOwner(): SSROwner | undefined
export declare function createSSROwner(parent?: SSROwner | undefined): SSROwner
export declare function runWithSSROwner<T>(
  owner: SSROwner | undefined,
  fn: () => T,
): T
export declare function disposeSSROwner(owner: SSROwner): void
export declare function createContext<T>(): SSRContext<T>
export declare function createContext<T>(defaultValue: T): SSRContext<T>
export declare function provide<T>(context: SSRContext<T>, value: T): void
export declare function inject<T>(context: SSRContext<T>): T
export declare function inject<T>(context: SSRContext<T>, fallback: T): T
export declare function useContext<T>(context: SSRContext<T>): T
export declare function useContext<T>(context: SSRContext<T>, fallback: T): T

export interface SSRPortalProps extends Record<string, unknown> {
  /** Client-only portal target; ignored during server rendering. */
  target?: unknown
  children?: SSRNode | (() => SSRNode)
}
/**
 * A portal has no server-side position: there is no live DOM target to move
 * nodes into. The server renders its children inline at the source position,
 * and the client takes over the real placement after upgrade. This mirrors the
 * behavior of React's `createPortal` under `renderToString`.
 */
export declare function Portal(props: SSRPortalProps): SSRNode
export interface SSRTransitionProps extends Record<string, unknown> {
  when?: unknown
  children?: SSRNode | (() => SSRNode)
  fallback?: SSRNode | (() => SSRNode)
}
/**
 * SSR has no animation lifecycle. The server serializes the same branch the
 * client shows initially, matching the compiler's `<Transition>` lowering.
 */
export declare function Transition(props: SSRTransitionProps): SSRNode

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
 * Version of the experimental streaming protocol. Bump it when the shape of
 * [`renderToStream`] or its chunk contract changes; the synchronous
 * `renderToString()` protocol is versioned by RFC-004 instead.
 */
export declare const SSR_STREAMING_API_VERSION = 1
export interface RenderToStreamOptions {
  /** Cancels the stream and disposes the request scope. */
  signal?: AbortSignal
  /**
   * Minimum number of characters buffered before a chunk is flushed.
   * Escaping runs before chunking, so a chunk never carries a partially
   * escaped value; chunks are transport units and the consumer concatenates
   * them before parsing.
   */
  flushAt?: number
}
/**
 * A streaming source: an async generator that yields already-compiled SSR
 * nodes. Each `await` between yields is real asynchronous work; the runtime
 * serializes each yielded value with the same escaping guarantees as
 * `renderToString()`.
 */
export type SSRStreamSource = AsyncIterable<SSRNode>
/**
 * Renders a tree, or an async generator of trees, into a `ReadableStream` of
 * UTF-8 chunks.
 *
 * - Backpressure is native: the source is advanced only when the stream wants
 *   another chunk, so a slow reader throttles an async generator.
 * - Aborting `signal` stops the generator, disposes its request scope and
 *   errors the stream with an `AbortError`.
 * - A source that throws after a flush leaves the already-emitted chunks
 *   readable and errors the rest of the stream.
 * - Every request gets its own context owner and reactive root, created in
 *   `start` and disposed on close, cancel or error.
 *
 * A source yields already-resolved nodes: JavaScript itself awaits a Promise
 * yielded by an async generator, so the runtime only rejects thenables that
 * reach it unresolved — a render factory that returns a Promise, or a Promise
 * inside a yielded array.
 *
 * Not supported, with explicit runtime errors: async iterables passed to
 * `renderToString()`, unresolved Promise values, and `Promise` render
 * factories.
 */
export declare function renderToStream(
  input: () => SSRNode | SSRStreamSource,
  options?: RenderToStreamOptions,
): ReadableStream<Uint8Array>
```
