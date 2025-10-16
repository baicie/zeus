import type * as BabelCore from '@babel/core'
import type { CompilerConfig } from './config'
import type * as t from '@babel/types'

export type JSXNode =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
interface ExtraHub {
  hub: {
    file?: {
      ast: {
        comments: {
          value: string
        }[]
      }
      metadata: {
        config: CompilerConfig
      }
    }
  }
}

export type JSXElementPath = NodePathHub<t.JSXElement>
export type JSXFragmentPath = NodePathHub<t.JSXFragment>

export type NodePathHub<T = JSXNode> = BabelCore.NodePath<T> & ExtraHub

export interface TransformInfo {
  topLevel?: boolean
  lastElement?: boolean
  fragmentChild?: boolean
  skipId?: boolean
  toBeClosed?: Set<string>
  componentChild?: boolean
  doNotEscape?: boolean
}

export interface TransformState {
  skip: boolean
  config: CompilerConfig
  opts: any
}

export interface TransformResult {
  template: string
  templateWithClosingTags?: string
  declarations?: t.VariableDeclaration[]
  exprs: (t.Expression | t.ExpressionStatement)[]
  dynamics?: t.Expression[]
  postExprs?: (t.Expression | t.ExpressionStatement)[]
  isSVG?: boolean
  hasCustomElement?: boolean
  isImportNode?: boolean
  tagName?: string
  renderer?: string
  skipTemplate?: boolean
  id?: t.Identifier
  toBeClosed?: Set<string>
  hasHydratableEvent?: boolean
  component?: boolean
  text?: boolean
  dynamic?: boolean
}
