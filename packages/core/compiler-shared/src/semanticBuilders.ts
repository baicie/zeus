import type {
  AttrBindingIR,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
  ExpressionIR,
  ForIR,
  FragmentIR,
  HostAttrIR,
  HostIR,
  IdentifierIR,
  IRRef,
  PropBindingIR,
  RefBindingIR,
  ShowIR,
  SlotIR,
  SourceSpan,
  StaticAttributeIR,
  TextIR,
  ZeusIRNode,
} from './nodes'

let nextId = 0

export function id(): number {
  return nextId++
}

export function ref(name: string): IRRef {
  return { name }
}

export function expressionIR(code: string, span?: SourceSpan): ExpressionIR {
  return {
    kind: 'Expression',
    code,
    span,
  }
}

export function identifierIR(name: string, span?: SourceSpan): IdentifierIR {
  return {
    kind: 'Identifier',
    name,
    span,
  }
}

export function elementIR(input: {
  ref: IRRef
  tagName: string
  attrs?: ElementIR['attrs']
  children?: ZeusIRNode[]
  flags?: Partial<ElementIR['flags']>
}): ElementIR {
  return {
    id: id(),
    kind: 'Element',
    ref: input.ref,
    tagName: input.tagName,
    attrs: input.attrs ?? [],
    children: input.children ?? [],
    flags: {
      isSVG: false,
      isVoid: false,
      isCustomElement: input.tagName.includes('-'),
      ...input.flags,
    },
  }
}

export function textIR(value: string): TextIR {
  return {
    id: id(),
    kind: 'Text',
    value,
  }
}

export function dynamicTextIR(
  expr: ExpressionIR,
  nodeRef: IRRef,
  once = false,
): DynamicTextIR {
  return {
    id: id(),
    kind: 'DynamicText',
    expr,
    ref: nodeRef,
    once,
  }
}

export function fragmentIR(children: ZeusIRNode[]): FragmentIR {
  return {
    id: id(),
    kind: 'Fragment',
    children,
  }
}

export function staticAttrIR(
  name: string,
  value: string | true,
): StaticAttributeIR {
  return {
    id: id(),
    kind: 'StaticAttribute',
    name,
    value,
  }
}

export function attrBindingIR(name: string, expr: ExpressionIR): AttrBindingIR {
  return {
    id: id(),
    kind: 'AttrBinding',
    name,
    expr,
  }
}

export function propBindingIR(name: string, expr: ExpressionIR): PropBindingIR {
  return {
    id: id(),
    kind: 'PropBinding',
    name,
    expr,
  }
}

export function eventBindingIR(
  eventName: string,
  handler: ExpressionIR,
): EventBindingIR {
  return {
    id: id(),
    kind: 'EventBinding',
    eventName,
    handler,
  }
}

export function refBindingIR(expr: ExpressionIR): RefBindingIR {
  return {
    id: id(),
    kind: 'RefBinding',
    expr,
  }
}

export function componentIR(input: {
  ref: IRRef
  callee: ExpressionIR
  props: ComponentIR['props']
}): ComponentIR {
  return {
    id: id(),
    kind: 'Component',
    ref: input.ref,
    callee: input.callee,
    props: input.props,
  }
}

export function showIR(input: {
  ref: IRRef
  when: ExpressionIR
  children: ZeusIRNode[]
  fallback?: ExpressionIR | ZeusIRNode[]
}): ShowIR {
  return {
    id: id(),
    kind: 'Show',
    ref: input.ref,
    when: input.when,
    children: input.children,
    fallback: input.fallback,
  }
}

export function forIR(input: {
  ref: IRRef
  each: ExpressionIR
  by?: ExpressionIR
  item: IdentifierIR
  index?: IdentifierIR
  body: ZeusIRNode[]
}): ForIR {
  return {
    id: id(),
    kind: 'For',
    ref: input.ref,
    each: input.each,
    by: input.by,
    item: input.item,
    index: input.index,
    body: input.body,
  }
}

export function hostIR(input: {
  attrs: HostAttrIR[]
  child?: ZeusIRNode
  span?: SourceSpan
}): HostIR {
  return {
    id: id(),
    kind: 'Host',
    attrs: input.attrs,
    child: input.child,
    span: input.span,
  }
}

export function slotIR(input: {
  ref: IRRef
  name?: string
  fallback?: ZeusIRNode[]
  span?: SourceSpan
}): SlotIR {
  return {
    id: id(),
    kind: 'Slot',
    ref: input.ref,
    name: input.name,
    fallback: input.fallback ?? [],
    span: input.span,
  }
}
