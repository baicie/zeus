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

export declare function ssrElement(
  tag: string,
  attributes?: readonly SSRAttributeEntry[],
  children?: SSRNode,
  isVoid?: boolean,
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
```
