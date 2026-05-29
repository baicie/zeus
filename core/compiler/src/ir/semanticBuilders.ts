import type {
  AttrBindingIR,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
  ForIR,
  FragmentIR,
  HostIR,
  IRRef,
  PropBindingIR,
  RefBindingIR,
  ShowIR,
  SlotIR,
  StaticAttributeIR,
  TextIR,
  ZeusIRNode,
} from './nodes'
import type * as t from '@babel/types'

let nextId = 0

function id(): number {
  return nextId++
}

export function ref(name: string): IRRef {
  return { name }
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
  expr: t.Expression,
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

export function attrBindingIR(name: string, expr: t.Expression): AttrBindingIR {
  return {
    id: id(),
    kind: 'AttrBinding',
    name,
    expr,
  }
}

export function propBindingIR(name: string, expr: t.Expression): PropBindingIR {
  return {
    id: id(),
    kind: 'PropBinding',
    name,
    expr,
  }
}

export function eventBindingIR(
  eventName: string,
  handler: t.Expression,
): EventBindingIR {
  return {
    id: id(),
    kind: 'EventBinding',
    eventName,
    handler,
  }
}

export function refBindingIR(expr: t.Expression): RefBindingIR {
  return {
    id: id(),
    kind: 'RefBinding',
    expr,
  }
}

export function componentIR(input: {
  ref: IRRef
  callee: t.Expression
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
  when: t.Expression
  children: ZeusIRNode[]
  fallback?: t.Expression | ZeusIRNode[]
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
  each: t.Expression
  by?: t.Expression
  item: t.Identifier
  index?: t.Identifier
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

export function hostIR(children: ZeusIRNode[]): HostIR {
  return {
    id: id(),
    kind: 'Host',
    children,
  }
}

export function slotIR(input: {
  ref: IRRef
  name?: string
  fallback?: ZeusIRNode[]
}): SlotIR {
  return {
    id: id(),
    kind: 'Slot',
    ref: input.ref,
    name: input.name,
    fallback: input.fallback ?? [],
  }
}
