import type {
  AttrBindingIR,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
  ExpressionForm,
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

export function expressionIR(
  code: string,
  span: SourceSpan,
  form: ExpressionForm = 'value',
  forAccessors: ExpressionIR['forAccessors'] = [],
): ExpressionIR {
  return {
    kind: 'Expression',
    code,
    span,
    form,
    forAccessors,
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
  span?: SourceSpan
}): ElementIR {
  return {
    id: id(),
    kind: 'Element',
    ref: input.ref,
    tagName: input.tagName,
    attrs: input.attrs ?? [],
    children: input.children ?? [],
    ...(input.span === undefined ? {} : { span: input.span }),
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
  span: SourceSpan,
): StaticAttributeIR {
  return {
    id: id(),
    kind: 'StaticAttribute',
    name,
    value,
    span,
  }
}

export function attrBindingIR(
  name: string,
  expr: ExpressionIR,
  span: SourceSpan,
  once = false,
): AttrBindingIR {
  return {
    id: id(),
    kind: 'AttrBinding',
    name,
    expr,
    once,
    span,
  }
}

export function propBindingIR(
  name: string,
  expr: ExpressionIR,
  span: SourceSpan,
  once = false,
): PropBindingIR {
  return {
    id: id(),
    kind: 'PropBinding',
    name,
    expr,
    once,
    span,
  }
}

export function eventBindingIR(
  eventName: string,
  handler: ExpressionIR,
  span: SourceSpan,
): EventBindingIR {
  return {
    id: id(),
    kind: 'EventBinding',
    eventName,
    handler,
    span,
  }
}

export function refBindingIR(
  expr: ExpressionIR,
  span: SourceSpan,
): RefBindingIR {
  return {
    id: id(),
    kind: 'RefBinding',
    expr,
    span,
  }
}

export function componentIR(input: {
  ref: IRRef
  callee: ExpressionIR
  props: ComponentIR['props']
  span?: SourceSpan
}): ComponentIR {
  return {
    id: id(),
    kind: 'Component',
    ref: input.ref,
    callee: input.callee,
    props: input.props,
    ...(input.span === undefined ? {} : { span: input.span }),
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
