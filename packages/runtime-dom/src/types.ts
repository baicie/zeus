export type JSXPrimitive = string | number | boolean | null | undefined

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
  | { value: T | null }
  | { current: T | null }
