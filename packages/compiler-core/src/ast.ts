import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { declare } from '@babel/helper-plugin-utils'
import type * as BabelCore from '@babel/core'

// AST 节点类型
export type NodeTypes =
  | 'Element'
  | 'Text'
  | 'Expression'
  | 'Attribute'
  | 'Directive'

// 基础节点接口
export interface Node {
  type: NodeTypes
  loc?: t.SourceLocation
}

// 转换上下文
export interface TransformContext {
  // 当前正在处理的节点路径
  currentPath: NodePath
  // 选项
  options: TransformOptions
  // 帮助函数集合
  helpers: Set<string>
  // 是否在静态模式
  inStatic: boolean
  // 标识符计数器（用于生成唯一标识符）
  identifierCount: number
  // 模块名称
  moduleName: string
}

// 转换器类型
export type NodeTransform = (
  node: NodePath,
  context: TransformContext
) => void | (() => void) | (() => void)[]

// 指令转换器
export type DirectiveTransform = (
  dir: NodePath<t.JSXAttribute>,
  context: TransformContext
) => void

// 转换选项
export interface TransformOptions {
  nodeTransforms?: NodeTransform[]
  directiveTransforms?: Record<string, DirectiveTransform>
  // 是否保留注释
  comments?: boolean
  // 是否开启 hoisting
  hoistStatic?: boolean
  // 前缀标识符
  prefixIdentifiers?: boolean
  // 目标环境
  target?: 'module' | 'script'
  // 内置组件
  builtIns?: string[]
  // 模块名称
  moduleName: string
}

export type Declare = ReturnType<typeof declare<{}, BabelCore.PluginObj>>
