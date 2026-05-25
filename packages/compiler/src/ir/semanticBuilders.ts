import type {
  AttrBindingIR,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
  FragmentIR,
  IRRef,
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
): DynamicTextIR {
  return {
    id: id(),
    kind: 'DynamicText',
    expr,
    ref: nodeRef,
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
