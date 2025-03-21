import type { SourceLocation } from '@babel/types'

export enum NodeTypes {
  ROOT,
  ELEMENT,
  TEXT,
  COMMENT,
  SIMPLE_EXPRESSION,
  INTERPOLATION,
  ATTRIBUTE,
  DIRECTIVE,
  // ... 其他节点类型
}

export type TemplateChildNode =
  | ElementNode
  | TextNode
  | CommentNode
  | InterpolationNode

export interface Node {
  type: NodeTypes
  loc?: SourceLocation | null
}

export interface Position {
  offset: number // 从源码开始的偏移量
  line: number // 行号
  column: number // 列号
}

export interface RootNode extends Node {
  type: NodeTypes.ROOT
  children: TemplateChildNode[]
  helpers: symbol[]
}

export interface ElementNode extends Node {
  type: NodeTypes.ELEMENT
  tag: string
  props: Array<AttributeNode | DirectiveNode>
  children: TemplateChildNode[]
}

export interface TextNode extends Node {
  type: NodeTypes.TEXT
  content: string
}

export interface CommentNode extends Node {
  type: NodeTypes.COMMENT
  content: string
}

export interface InterpolationNode extends Node {
  type: NodeTypes.INTERPOLATION
  content: ExpressionNode
}

export interface ExpressionNode extends Node {
  type: NodeTypes.SIMPLE_EXPRESSION
  content: string
  isStatic: boolean
}

export interface AttributeNode extends Node {
  type: NodeTypes.ATTRIBUTE
  name: string
  value: TextNode | undefined
}

export interface DirectiveNode extends Node {
  type: NodeTypes.DIRECTIVE
  name: string // 指令名称，如 'on', 'bind' 等
  exp: ExpressionNode | undefined // 指令表达式
  arg: ExpressionNode | undefined // 指令参数
  modifiers: string[] // 修饰符列表
}
