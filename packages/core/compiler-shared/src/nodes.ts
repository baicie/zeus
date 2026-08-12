export interface SourcePosition {
  line: number
  column: number
  offset: number
}

export interface SourceSpan {
  start: SourcePosition
  end: SourcePosition
}

export interface ExpressionIR {
  kind: 'Expression'
  code: string
  span: SourceSpan
  form: ExpressionForm
}

export type ExpressionForm = 'value' | 'getter' | 'member'

export interface IdentifierIR {
  kind: 'Identifier'
  name: string
  span?: SourceSpan
}

export interface IRRef {
  name: string
}

export type DomPath =
  | { kind: 'Root' }
  | { kind: 'FirstChild'; parent: IRRef }
  | { kind: 'NextSibling'; previous: IRRef }
  | { kind: 'Child'; parent: IRRef; index: number }
  | { kind: 'Marker'; parent: IRRef; index: number }

export type PhysicalDomPath =
  | { kind: 'Root' }
  | { kind: 'FirstChild'; parent: IRRef }
  | { kind: 'NextSibling'; previous: IRRef }
  | { kind: 'ChildNode'; parent: IRRef; index: number }

export interface SemanticBaseIRNode {
  id: number
  span?: SourceSpan
}

export type AttributeBaseIRNode = Omit<SemanticBaseIRNode, 'span'> & {
  span: SourceSpan
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
  physicalDomPath?: PhysicalDomPath
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
  expr: ExpressionIR
  ref: IRRef
  once?: boolean
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}

export type StaticAttributeIR = AttributeBaseIRNode & {
  kind: 'StaticAttribute'
  name: string
  value: string | true
}

export type AttrBindingIR = AttributeBaseIRNode & {
  kind: 'AttrBinding'
  name: string
  expr: ExpressionIR
}

export type PropBindingIR = AttributeBaseIRNode & {
  kind: 'PropBinding'
  name: string
  expr: ExpressionIR
}

export type EventBindingIR = AttributeBaseIRNode & {
  kind: 'EventBinding'
  eventName: string
  handler: ExpressionIR
}

export type RefBindingIR = AttributeBaseIRNode & {
  kind: 'RefBinding'
  expr: ExpressionIR
}

export type AttributeIR =
  | StaticAttributeIR
  | AttrBindingIR
  | PropBindingIR
  | EventBindingIR
  | RefBindingIR

export interface ComponentPropIR {
  name: string
  value: ExpressionIR | ZeusIRNode[]
}

export type ComponentIR = SemanticBaseIRNode & {
  kind: 'Component'
  ref: IRRef
  callee: ExpressionIR
  props: ComponentPropIR[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}

export type FragmentIR = SemanticBaseIRNode & {
  kind: 'Fragment'
  children: ZeusIRNode[]
}

export type ShowIR = SemanticBaseIRNode & {
  kind: 'Show'
  ref: IRRef
  when: ExpressionIR
  children: ZeusIRNode[]
  fallback?: ExpressionIR | ZeusIRNode[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}

export type ForIR = SemanticBaseIRNode & {
  kind: 'For'
  ref: IRRef
  each: ExpressionIR
  by?: ExpressionIR
  item: IdentifierIR
  index?: IdentifierIR
  body: ZeusIRNode[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}

export type HostAttrIR = SemanticBaseIRNode & {
  kind: 'HostAttr'
  name: string
  expr: ExpressionIR
}

export type HostIR = SemanticBaseIRNode & {
  kind: 'Host'
  attrs: HostAttrIR[]
  child?: ZeusIRNode
}

export type SlotIR = SemanticBaseIRNode & {
  kind: 'Slot'
  ref: IRRef
  name?: string
  fallback: ZeusIRNode[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
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
