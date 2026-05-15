/**
 * Transform result factory.
 *
 * Provides a typed class with static `create` methods for constructing
 * transform results with all the shared default fields pre-filled.
 *
 * This replaces the pattern of manually constructing objects with repeated
 * default field assignments across text.ts, fragment.ts, expression.ts, etc.
 */
import type {
  BabelIdentifier,
  BabelExpression,
  DynamicTransformResults,
  TextTransformResults,
  TransformResults,
  BaseTransformResults,
} from '../types'

const DEFAULTS: Pick<
  BaseTransformResults,
  | 'declarations'
  | 'exprs'
  | 'dynamics'
  | 'postExprs'
  | 'isSVG'
  | 'hasCustomElement'
  | 'isImportNode'
  | 'skipTemplate'
  | 'renderer'
> = {
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

export class TransformResult<T extends TransformResults = TransformResults> {
  kind!: T['kind']
  dynamic!: true | undefined
  text!: true | undefined
  template!: string
  templateWithClosingTags!: string
  declarations!: BaseTransformResults['declarations']
  exprs!: BaseTransformResults['exprs']
  dynamics!: BaseTransformResults['dynamics']
  postExprs!: BaseTransformResults['postExprs']
  isSVG!: boolean
  hasCustomElement!: boolean
  isImportNode!: boolean
  skipTemplate!: boolean
  renderer!: BaseTransformResults['renderer']
  toBeClosed?: Set<string>
  hasHydratableEvent?: boolean

  /** Element result fields */
  id?: BabelIdentifier
  tagName?: string

  /** Dynamic result fields */
  expr?: BabelExpression

  private constructor() {}

  static createDynamic(expr: BabelExpression): DynamicTransformResults {
    return {
      kind: 'dynamic',
      dynamic: true,
      expr,
      template: '',
      templateWithClosingTags: '',
      ...DEFAULTS,
    }
  }

  static createText(template: string): TextTransformResults {
    return {
      kind: 'text',
      text: true,
      template,
      templateWithClosingTags: template,
      ...DEFAULTS,
    }
  }
}
