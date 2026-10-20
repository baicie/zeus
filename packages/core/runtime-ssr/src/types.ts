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
