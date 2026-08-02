# @zeus-js/compiler-shared (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export interface SourcePosition {
  line: number
  column: number
  offset?: number
}
export interface SourceSpan {
  start: SourcePosition
  end: SourcePosition
}
export interface ExpressionIR {
  kind: 'Expression'
  code: string
  span?: SourceSpan
}
export interface IdentifierIR {
  kind: 'Identifier'
  name: string
  span?: SourceSpan
}
export interface IRRef {
  name: string
}
export type DomPath =
  | {
      kind: 'Root'
    }
  | {
      kind: 'FirstChild'
      parent: IRRef
    }
  | {
      kind: 'NextSibling'
      previous: IRRef
    }
  | {
      kind: 'Child'
      parent: IRRef
      index: number
    }
  | {
      kind: 'Marker'
      parent: IRRef
      index: number
    }
export type PhysicalDomPath =
  | {
      kind: 'Root'
    }
  | {
      kind: 'FirstChild'
      parent: IRRef
    }
  | {
      kind: 'NextSibling'
      previous: IRRef
    }
  | {
      kind: 'ChildNode'
      parent: IRRef
      index: number
    }
export interface SemanticBaseIRNode {
  id: number
  span?: SourceSpan
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
export type StaticAttributeIR = SemanticBaseIRNode & {
  kind: 'StaticAttribute'
  name: string
  value: string | true
}
export type AttrBindingIR = SemanticBaseIRNode & {
  kind: 'AttrBinding'
  name: string
  expr: ExpressionIR
}
export type PropBindingIR = SemanticBaseIRNode & {
  kind: 'PropBinding'
  name: string
  expr: ExpressionIR
}
export type EventBindingIR = SemanticBaseIRNode & {
  kind: 'EventBinding'
  eventName: string
  handler: ExpressionIR
}
export type RefBindingIR = SemanticBaseIRNode & {
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

export declare function id(): number
export declare function ref(name: string): IRRef
export declare function expressionIR(
  code: string,
  span?: SourceSpan,
): ExpressionIR
export declare function identifierIR(
  name: string,
  span?: SourceSpan,
): IdentifierIR
export declare function elementIR(input: {
  ref: IRRef
  tagName: string
  attrs?: ElementIR['attrs']
  children?: ZeusIRNode[]
  flags?: Partial<ElementIR['flags']>
}): ElementIR
export declare function textIR(value: string): TextIR
export declare function dynamicTextIR(
  expr: ExpressionIR,
  nodeRef: IRRef,
  once?: boolean,
): DynamicTextIR
export declare function fragmentIR(children: ZeusIRNode[]): FragmentIR
export declare function staticAttrIR(
  name: string,
  value: string | true,
): StaticAttributeIR
export declare function attrBindingIR(
  name: string,
  expr: ExpressionIR,
): AttrBindingIR
export declare function propBindingIR(
  name: string,
  expr: ExpressionIR,
): PropBindingIR
export declare function eventBindingIR(
  eventName: string,
  handler: ExpressionIR,
): EventBindingIR
export declare function refBindingIR(expr: ExpressionIR): RefBindingIR
export declare function componentIR(input: {
  ref: IRRef
  callee: ExpressionIR
  props: ComponentIR['props']
}): ComponentIR
export declare function showIR(input: {
  ref: IRRef
  when: ExpressionIR
  children: ZeusIRNode[]
  fallback?: ExpressionIR | ZeusIRNode[]
}): ShowIR
export declare function forIR(input: {
  ref: IRRef
  each: ExpressionIR
  by?: ExpressionIR
  item: IdentifierIR
  index?: IdentifierIR
  body: ZeusIRNode[]
}): ForIR
export declare function hostIR(input: {
  attrs: HostAttrIR[]
  child?: ZeusIRNode
  span?: SourceSpan
}): HostIR
export declare function slotIR(input: {
  ref: IRRef
  name?: string
  fallback?: ZeusIRNode[]
  span?: SourceSpan
}): SlotIR

export interface IRVisitor {
  enter?: (node: ZeusIRNode, parent?: ZeusIRNode) => void
  leave?: (node: ZeusIRNode, parent?: ZeusIRNode) => void
}
export declare function visitIR(
  node: ZeusIRNode,
  visitor: IRVisitor,
  parent?: ZeusIRNode,
): void
export declare function getIRChildren(node: ZeusIRNode): ZeusIRNode[]
export declare function getComponentChildren(node: ComponentIR): ZeusIRNode[]

export declare function assertElementIR(
  node: ZeusIRNode,
): asserts node is ElementIR
export declare function assertNeverIR(node: never): never
```
