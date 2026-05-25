import type * as t from '@babel/types'

export type IRRef = {
  name: string
}

export type DomPath =
  | { kind: 'Root' }
  | { kind: 'FirstChild'; parent: IRRef }
  | { kind: 'NextSibling'; previous: IRRef }
  | { kind: 'Marker'; parent: IRRef; index: number }

export type SemanticBaseIRNode = {
  id: number
  loc?: t.SourceLocation | null
}

export type ProgramIR = SemanticBaseIRNode & {
  kind: 'Program'
  body: ZeusIRNode[]
}

export type ElementIR = SemanticBaseIRNode & {
  kind: 'Element'
  ref: IRRef
  tagName: string
  attrs: AttributeIR[]
  children: ZeusIRNode[]
  domPath?: DomPath
  flags: {
    isSVG: boolean
    isVoid: boolean
    isCustomElement: boolean
  }
}

export type TextIR = SemanticBaseIRNode & {
  kind: 'Text'
  value: string
}

export type DynamicTextIR = SemanticBaseIRNode & {
  kind: 'DynamicText'
  expr: t.Expression
  ref: IRRef
  domPath?: DomPath
}

export type StaticAttributeIR = SemanticBaseIRNode & {
  kind: 'StaticAttribute'
  name: string
  value: string | true
}

export type AttrBindingIR = SemanticBaseIRNode & {
  kind: 'AttrBinding'
  name: string
  expr: t.Expression
}

export type PropBindingIR = SemanticBaseIRNode & {
  kind: 'PropBinding'
  name: string
  expr: t.Expression
}

export type EventBindingIR = SemanticBaseIRNode & {
  kind: 'EventBinding'
  eventName: string
  handler: t.Expression
}

export type AttributeIR =
  | StaticAttributeIR
  | AttrBindingIR
  | PropBindingIR
  | EventBindingIR

export type ComponentPropIR = {
  name: string
  value: t.Expression
}

export type ComponentIR = SemanticBaseIRNode & {
  kind: 'Component'
  ref: IRRef
  callee: t.Expression
  props: ComponentPropIR[]
  domPath?: DomPath
}

export type FragmentIR = SemanticBaseIRNode & {
  kind: 'Fragment'
  children: ZeusIRNode[]
}

export type ShowIR = SemanticBaseIRNode & {
  kind: 'Show'
  when: t.Expression
  children: ZeusIRNode[]
  fallback?: ZeusIRNode[]
}

export type ForIR = SemanticBaseIRNode & {
  kind: 'For'
  each: t.Expression
  item: t.Identifier
  index?: t.Identifier
  body: ZeusIRNode[]
}

export type HostIR = SemanticBaseIRNode & {
  kind: 'Host'
  children: ZeusIRNode[]
}

export type SlotIR = SemanticBaseIRNode & {
  kind: 'Slot'
  name?: string
  fallback: ZeusIRNode[]
}

export type ZeusIRNode =
  | ElementIR
  | TextIR
  | DynamicTextIR
  | ComponentIR
  | FragmentIR
  | ShowIR
  | ForIR
  | HostIR
  | SlotIR
