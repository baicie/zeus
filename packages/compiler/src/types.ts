import type { Expression } from '@babel/types'

/**
 * 编译器选项
 */
export interface CompilerOptions {
  /** 模块名称，用于导入运行时函数 */
  moduleName?: string
  /** 是否生成 source map */
  generateSourceMap?: boolean
  /** 是否优化模板 */
  optimizeTemplates?: boolean
  /** 是否内联简单表达式 */
  inlineExpressions?: boolean
  /** 自定义元素检测函数 */
  isCustomElement?: (tag: string) => boolean
  /** Web Components 模式 */
  webComponentsMode?: 'shadow' | 'light' | 'auto'
}

/**
 * JSX 元素类型
 */
export interface JSXElement {
  type: 'JSXElement'
  tag: string
  attributes: JSXAttribute[]
  children: JSXChild[]
  isCustomElement?: boolean
}

/**
 * JSX 属性
 */
export interface JSXAttribute {
  name: string
  value: JSXExpression | string | boolean
  isDynamic: boolean
}

/**
 * JSX 子节点
 */
export type JSXChild = JSXElement | JSXFragment | JSXExpression | string

/**
 * JSX 表达式
 */
export interface JSXExpression {
  type: 'JSXExpressionContainer'
  expression: Expression
}

/**
 * JSX Fragment
 */
export interface JSXFragment {
  type: 'JSXFragment'
  children: JSXChild[]
}

/**
 * 模板节点
 */
export interface TemplateNode {
  /** 模板 ID */
  id: string
  /** 静态 HTML 内容 */
  html: string
  /** 动态绑定 */
  bindings: DynamicBinding[]
  /** 是否包含子元素 */
  hasChildren: boolean
}

/**
 * 动态绑定
 */
export interface DynamicBinding {
  /** 绑定类型 */
  type: 'attribute' | 'text' | 'event' | 'class' | 'style'
  /** 属性名或事件名 */
  name: string
  /** 表达式 */
  expression: Expression
  /** 在模板中的位置 */
  position: number
  /** 是否安全（不需要转义） */
  safe?: boolean
}

/**
 * 编译结果
 */
export interface CompileResult {
  /** 生成的代码 */
  code: string
  /** 模板定义 */
  templates: TemplateNode[]
  /** 导入声明 */
  imports: string[]
  /** 错误信息 */
  errors: string[]
}
