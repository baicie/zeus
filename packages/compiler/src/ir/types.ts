/**
 * Zeus Intermediate Representation (IR) types.
 *
 * These types represent the compiler's internal AST-independent intermediate
 * representation, which bridges the gap between Babel JSX AST and the
 * runtime DOM operations.
 */
import type {
  BabelIdentifier,
  BabelExpression,
  BabelStatement,
  ZeusRenderer,
} from '../types'

/** Renderer target for an IR node. */
export type { ZeusRenderer }

export type { BabelIdentifier, BabelExpression, BabelStatement }

//#region base IR node

export type BaseIRNode = {
  /** Static HTML template string for this node. */
  template: string
  /** Full template including all nested children tags (for DOM walk correctness). */
  templateWithClosingTags?: string
  /** Variable declarations to prepend before the template call. */
  declarations: BabelStatement[]
  /** Expression statements to execute after template clone. */
  exprs: BabelStatement[]
  /** Dynamic expression statements that run during effect. */
  dynamics: BabelStatement[]
  /** Statements to run after everything else. */
  postExprs: BabelStatement[]
  isSVG: boolean
  hasCustomElement: boolean
  isImportNode: boolean
  skipTemplate: boolean
  renderer: ZeusRenderer
  /** Tags that still need closing (internal, for DOM walk). */
  toBeClosed?: Set<string>
  hasHydratableEvent?: boolean
}

//#endregion

//#region element IR

export type ElementIRNode = BaseIRNode & {
  kind: 'element'
  /** Unique identifier for the cloned DOM element node. */
  id: BabelIdentifier
  /** HTML tag name (lowercase). */
  tagName: string
}

//#endregion

//#region text IR

export type TextIRNode = BaseIRNode & {
  kind: 'text'
  text: true
}

//#endregion

//#region dynamic IR

export type DynamicIRNode = BaseIRNode & {
  kind: 'dynamic'
  dynamic: true
  /** The expression to render at runtime. */
  expr: BabelExpression
}

//#endregion

//#region element IR factory

export function createElementIR(
  tagName: string,
  id: BabelIdentifier,
  options?: Partial<BaseIRNode>,
): ElementIRNode {
  return {
    kind: 'element',
    template: `<${tagName}`,
    templateWithClosingTags: `<${tagName}`,
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    isSVG: false,
    hasCustomElement: tagName.indexOf('-') > -1,
    isImportNode: tagName === 'img' || tagName === 'iframe',
    skipTemplate: false,
    tagName,
    renderer: 'dom',
    id,
    ...options,
  }
}

//#endregion

//#region text IR factory

export function createTextIR(escapedText: string): TextIRNode {
  return {
    kind: 'text',
    text: true,
    template: escapedText,
    templateWithClosingTags: escapedText,
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    isSVG: false,
    hasCustomElement: false,
    isImportNode: false,
    skipTemplate: false,
    renderer: 'dom',
  }
}

//#endregion

//#region dynamic IR factory

export function createDynamicIR(expr: BabelExpression): DynamicIRNode {
  return {
    kind: 'dynamic',
    dynamic: true,
    expr,
    template: '',
    templateWithClosingTags: '',
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    isSVG: false,
    hasCustomElement: false,
    isImportNode: false,
    skipTemplate: false,
    renderer: 'dom',
  }
}

//#endregion

//#region composite IR result

export type IRNode = ElementIRNode | TextIRNode | DynamicIRNode

export type IRResults = {
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
  kind: 'element' | 'text' | 'dynamic'
  /** Only for element kind */
  id?: BabelIdentifier
  /** Only for text kind */
  text?: true
  /** Only for dynamic kind */
  dynamic?: true
  /** Only for dynamic kind */
  expr?: BabelExpression
}

//#endregion
