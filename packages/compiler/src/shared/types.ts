import type * as t from '@babel/types'

export interface CompilerOptions {
  moduleName?: string
  generate?: 'dom' | 'ssr' | 'universal'
  hydratable?: boolean
  delegateEvents?: boolean
  delegatedEvents?: string[]
  builtIns?: string[]
  requireImportSource?: string | false
  wrapConditionals?: boolean
  omitNestedClosingTags?: boolean
  omitLastClosingTag?: boolean
  omitQuotes?: boolean
  contextToCustomElements?: boolean
  staticMarker?: string
  effectWrapper?: string
  memoWrapper?: string
  validate?: boolean
  inlineStyles?: boolean
}

export interface TransformInfo {
  topLevel?: boolean
  lastElement?: boolean
  toBeClosed?: Set<string>
  componentChild?: boolean
  fragmentChild?: boolean
  skipId?: boolean
  doNotEscape?: boolean
}

export interface TransformResult {
  template: string
  templateWithClosingTags?: string
  id?: t.Identifier
  templateId?: t.Identifier
  /** When set (e.g. component root), replaces the whole JSX with this expression */
  outputExpr?: t.Expression
  declarations: t.VariableDeclarator[]
  exprs: t.Statement[]
  dynamics: DynamicAttr[]
  postExprs: t.Statement[]
  tagName?: string
  renderer?: 'dom' | 'ssr' | 'universal'
  isSVG?: boolean
  hasCustomElement?: boolean
  isImportNode?: boolean
  skipTemplate?: boolean
  text?: boolean
  component?: boolean
  dynamic?: boolean
  spreadElement?: boolean
  hasHydratableEvent?: boolean
}

export interface DynamicAttr {
  elem: t.Identifier
  key: string
  value: t.Expression
  isSVG?: boolean
  isCE?: boolean
  tagName?: string
  prevId?: t.Identifier
}

export interface AttributeTransformOptions {
  isSVG: boolean
  dynamic: boolean
  prevId?: t.Identifier
  isCE?: boolean
  tagName?: string
}

export interface ScopeData {
  templates?: TemplateInfo[]
  imports?: Map<string, Map<string, t.Identifier>>
  events?: Set<string>
  config?: Required<CompilerOptions>
}

export interface TemplateInfo {
  id: t.Identifier
  template: string
  templateWithClosingTags: string
  isSVG: boolean
  isCE: boolean
  isImportNode: boolean
  renderer: 'dom' | 'ssr' | 'universal'
}

export interface RendererConfig extends Required<CompilerOptions> {
  renderers?: RendererInfo[]
}

export interface RendererInfo {
  name: string
  target: string
}

export type JSXName =
  | t.JSXIdentifier
  | t.JSXMemberExpression
  | t.JSXNamespacedName

export interface DynamicCheckOptions {
  checkMember?: boolean
  checkTags?: boolean
  checkCallExpressions?: boolean
  native?: boolean
}

declare module '@babel/core' {
  interface FileMetadata {
    config?: Required<CompilerOptions>
  }
}
