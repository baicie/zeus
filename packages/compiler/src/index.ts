/**
 * Zeus JSX Compiler
 * 将 JSX 编译为高效的 DOM 表达式，无虚拟 DOM
 */

export { createDOMCompiler } from './babel-plugin'
export type { CompilerOptions } from './types'

// 重新导出类型
export type {
  JSXElement,
  JSXFragment,
  JSXExpression,
  TemplateNode,
  DynamicBinding,
} from './types'
