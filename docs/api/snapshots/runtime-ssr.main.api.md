# @zeus-js/runtime-ssr (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export type SSRPrimitive = string | number | boolean | null | undefined
declare const SSR_FRAGMENT: unique symbol
export interface SSRFragment {
  readonly [SSR_FRAGMENT]: true
  readonly html: string
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
```
