import type { CompilerOptions } from '../config'
import type { ProgramScopeData } from '../utils/imports'
import type { PluginObj, PluginPass, NodePath, Visitor } from '@babel/core'
import type * as t from '@babel/types'
import type {
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXSpreadChild,
  JSXText,
  Program,
} from '@babel/types'

export { CompilerOptions }

export type { ProgramScopeData }

//#region babel plugin types

export type BabelState = PluginPass

export type BabelPlugin = PluginObj<BabelState>

export type BabelVisitor = Visitor<BabelState>

export type BabelProgramVisitor = NonNullable<BabelVisitor['Program']>

//#endregion

//#region babel node aliases

export type BabelProgram = Program

export type BabelStatement = t.Statement

export type BabelExpression = t.Expression

export type BabelIdentifier = t.Identifier

//#endregion

//#region babel path aliases

export type BabelProgramPath = NodePath<BabelProgram>

export type BabelJSXElementPath = NodePath<JSXElement>

export type BabelJSXFragmentPath = NodePath<JSXFragment>

export type BabelJSXTextPath = NodePath<JSXText>

export type BabelJSXExpressionContainerPath = NodePath<JSXExpressionContainer>

export type BabelJSXSpreadChildPath = NodePath<JSXSpreadChild>

export type BabelJSXPath =
  | BabelJSXElementPath
  | BabelJSXFragmentPath
  | BabelJSXTextPath
  | BabelJSXExpressionContainerPath
  | BabelJSXSpreadChildPath

//#endregion

//#region jsx node aliases

export type BabelJSXElement = JSXElement

export type BabelJSXFragment = JSXFragment

export type BabelJSXText = JSXText

export type BabelJSXExpressionContainer = JSXExpressionContainer

export type BabelJSXSpreadChild = JSXSpreadChild

export type BabelJSX =
  | BabelJSXElement
  | BabelJSXFragment
  | BabelJSXText
  | BabelJSXExpressionContainer
  | BabelJSXSpreadChild

//#endregion

//#region transform result

export type ZeusRenderer = 'dom'

export type BaseTransformResults = {
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

  renderer: ZeusRenderer
  toBeClosed?: Set<string>
  hasHydratableEvent?: boolean
}

export type ElementTransformResults = BaseTransformResults & {
  kind: 'element'
  id: BabelIdentifier
  tagName: string
}

export type TextTransformResults = BaseTransformResults & {
  kind: 'text'
  text: true
}

export type DynamicTransformResults = BaseTransformResults & {
  kind: 'dynamic'
  dynamic: true
  expr: BabelExpression
}

export type TransformResults =
  | ElementTransformResults
  | TextTransformResults
  | DynamicTransformResults

//#endregion
