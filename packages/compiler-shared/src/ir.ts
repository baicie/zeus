// Zeus IR (Intermediate Representation) types
// This is the core intermediate representation for the Zeus compiler

export type NodePath = number[]

export interface TemplateIR {
  kind: 'template'
  name: string
  html: string
  roots: number
  bindings: BindingIR[]
}

export interface FragmentIR {
  kind: 'fragment'
  children: Array<TemplateIR | ComponentBlockIR>
}

export type BindingIR =
  | TextBindingIR
  | AttrBindingIR
  | PropBindingIR
  | EventBindingIR
  | RefBindingIR
  | ShowBindingIR
  | ForBindingIR
  | ComponentBindingIR
  | SlotBindingIR
  | HostBindingIR

export interface TextBindingIR {
  type: 'text'
  path: NodePath
  expr: ExprIR
}

export interface AttrBindingIR {
  type: 'attr'
  path: NodePath
  name: string
  expr: ExprIR
}

export interface PropBindingIR {
  type: 'prop'
  path: NodePath
  name: string
  expr: ExprIR
}

export interface EventBindingIR {
  type: 'event'
  path: NodePath
  name: string
  handler: ExprIR
}

export interface RefBindingIR {
  type: 'ref'
  path: NodePath
  expr: ExprIR
}

export interface ShowBindingIR {
  type: 'show'
  path: NodePath
  when: ExprIR
  body: TemplateIR | FragmentIR | ComponentBlockIR
  fallback?: TemplateIR | FragmentIR | ComponentBlockIR
}

export interface ForBindingIR {
  type: 'for'
  path: NodePath
  each: ExprIR
  itemName: string
  indexName?: string
  body: TemplateIR | FragmentIR | ComponentBlockIR
  keyBy?: ExprIR
}

export interface ComponentBindingIR {
  type: 'component'
  path: NodePath
  component: ExprIR
  props: Record<string, ExprIR>
  children?: Array<TemplateIR | FragmentIR | ComponentBlockIR>
}

export interface HostBindingIR {
  type: 'host'
  shadow: boolean | 'open' | 'closed'
  delegatesFocus?: boolean
  body: TemplateIR | FragmentIR | ComponentBlockIR
}

export interface SlotBindingIR {
  type: 'slot'
  path: NodePath
  name?: string
}

export interface ExprIR {
  kind: 'js'
  node: any // Babel Expression node
  reactiveHint?: 'static' | 'dynamic' | 'unknown'
}

export interface ComponentBlockIR {
  kind: 'component'
  name: string
  params: string[]
  body: TemplateIR | FragmentIR | ComponentBindingIR
}

export function isTemplateBinding(binding: BindingIR): binding is TextBindingIR | AttrBindingIR | PropBindingIR | EventBindingIR | RefBindingIR | SlotBindingIR {
  return ['text', 'attr', 'prop', 'event', 'ref', 'slot'].includes(binding.type)
}

export function isControlFlowBinding(binding: BindingIR): binding is ShowBindingIR | ForBindingIR {
  return ['show', 'for'].includes(binding.type)
}
