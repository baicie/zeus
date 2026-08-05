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
