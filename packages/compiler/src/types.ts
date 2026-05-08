import type { CompilerOptions } from './config'
import type { Visitor, PluginObj, PluginPass, NodePath } from '@babel/core'
import type { Program } from '@babel/types'

export type { CompilerOptions }

export type BabelState = PluginPass

export type BabelPlugin = PluginObj<BabelState>

export type BabelVisitor = Visitor<BabelState>

export type BabelProgramPath = NodePath<Program>

export type BabelProgramVisitor = NonNullable<BabelVisitor['Program']>
