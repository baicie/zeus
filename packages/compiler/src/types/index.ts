import type { ProgramScopeData } from '../codegen/support'
import type { CompilerOptions } from '../config'
import type { PluginObj, PluginPass, NodePath, Visitor } from '@babel/core'
import type { JSXElement, JSXFragment, Program } from '@babel/types'

export { CompilerOptions }

export type { ProgramScopeData }

//#region babel plugin types

export type BabelState = PluginPass

export type BabelPlugin = PluginObj<BabelState>

export type BabelVisitor = Visitor<BabelState>

export type BabelProgramVisitor = NonNullable<BabelVisitor['Program']>

//#endregion

export type BabelProgram = Program

//#region babel path aliases

export type BabelProgramPath = NodePath<BabelProgram>

export type BabelJSXElementPath = NodePath<JSXElement>

export type BabelJSXFragmentPath = NodePath<JSXFragment>

export type BabelJSXPath = BabelJSXElementPath | BabelJSXFragmentPath

//#endregion

//#region jsx node aliases

export type BabelJSXElement = JSXElement

export type BabelJSXFragment = JSXFragment

export type BabelJSX = BabelJSXElement | BabelJSXFragment

//#endregion
