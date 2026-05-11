import type { CompilerOptions } from './config'
import type { Visitor, PluginObj, PluginPass, NodePath } from '@babel/core'
import type { JSXElement, JSXFragment, Program } from '@babel/types'

export type { CompilerOptions }

export type BabelState = PluginPass

export type BabelPlugin = PluginObj<BabelState>

export type BabelVisitor = Visitor<BabelState>

export type BabelProgramPath = NodePath<Program>

export type BabelJSXFragmentPath = NodePath<JSXFragment>

export type BabelJSXElementPath = NodePath<JSXElement>

export type BabelJSXPath = BabelJSXFragmentPath | BabelJSXElementPath

export type BabelProgramVisitor = NonNullable<BabelVisitor['Program']>
