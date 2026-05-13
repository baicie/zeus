import type { CompilerOptions } from './config'
import type { Visitor, PluginObj, PluginPass, NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { JSXElement, JSXFragment, Program } from '@babel/types'

export type { CompilerOptions }

//#region babel types
export type BabelState = PluginPass

export type BabelPlugin = PluginObj<BabelState>

export type BabelVisitor = Visitor<BabelState>

export type BabelProgramPath = NodePath<Program>

export type BabelJSXFragmentPath = NodePath<BabelJSXFragment>

export type BabelJSXElementPath = NodePath<BabelJSXElement>

export type BabelJSXPath = BabelJSXFragmentPath | BabelJSXElementPath

export type BabelJSX = BabelJSXElement | BabelJSXFragment

export type BabelJSXElement = JSXElement

export type BabelJSXFragment = JSXFragment

export type BabelProgramVisitor = NonNullable<BabelVisitor['Program']>

export type BabelStatement = t.Statement

export type BabelExpression = t.Expression

export type BabelIdentifier = t.Identifier
//#endregion

//#region element transform result
/**
 * transformElement / transformNode / transformFragment 等编译内部函数
 * 产生的中间结果类型，对齐 dom-expressions 的 results 对象结构。
 *
 * 字段说明：
 * - template: 累积的 HTML 模板字符串（仅开始标签 + 属性）
 * - templateWithClosingTags: 累积的完整模板字符串（含闭合标签）
 * - declarations: 顶层变量声明（const el$ = ...）
 * - exprs: 元素挂载表达式（$mount(el$, ...））
 * - dynamics: 动态绑定表达式
 * - postExprs: 尾部执行表达式（如 hydration events）
 * - isSVG: 是否在 SVG 上下文中
 * - hasCustomElement: 是否为自定义元素（标签含 - 或有 is attribute）
 * - isImportNode: 是否为 img/iframe 等预加载节点
 * - skipTemplate: 是否跳过模板生成（如 html/head/body 特殊处理）
 * - tagName: 标签名
 * - renderer: 渲染器类型，固定为 "dom"
 * - id: 可选，条件生成的 uid identifier
 * - toBeClosed: 可选，条件添加，需要闭合的标签名集合
 * - text: 是否为文本节点
 * - hasHydratableEvent: 是否包含 hydration 事件
 * - dynamic: 是否为动态表达式
 */
export type TransformResults = {
  template: string
  templateWithClosingTags: string
  declarations: BabelStatement[]
  exprs: BabelStatement[]
  dynamics: BabelStatement[]
  postExprs: BabelStatement[]
  isSVG: boolean
  hasCustomElement: boolean
  isImportNode: boolean
  skipTemplate: boolean
  tagName: string
  renderer: 'dom'
  id?: BabelIdentifier
  toBeClosed?: Set<string>
  text?: boolean
  hasHydratableEvent?: boolean
  dynamic?: boolean
}
//#endregion
