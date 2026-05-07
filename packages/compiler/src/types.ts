import type { CompilerConfig } from './config'
import type { Visitor, NodePath } from '@babel/core'
// import type { Program } from '@babel/types'

export type BabelVisitor = Visitor<{ opts: CompilerConfig }>
export type BabelNodePath = NodePath<{ opts: CompilerConfig }>
// export type BabelProgram = VisitNodeObject<Program>
