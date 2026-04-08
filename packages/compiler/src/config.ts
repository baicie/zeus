export interface CompilerRendererConfig {
  name: string
  moduleName: string
  elements: string[]
}

export interface CompilerOptions {
  moduleName?: string
  generate?: 'dom' | 'ssr' | 'universal'
  hydratable?: boolean
  delegateEvents?: boolean
  delegatedEvents?: string[]
  builtIns?: string[]
  requireImportSource?: false | string
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
  renderers?: CompilerRendererConfig[]
}

const DEFAULT_CONFIG: Required<CompilerOptions> = {
  moduleName: 'dom',
  generate: 'dom',
  hydratable: false,
  delegateEvents: true,
  delegatedEvents: [],
  builtIns: [],
  requireImportSource: false,
  wrapConditionals: true,
  omitNestedClosingTags: false,
  omitLastClosingTag: true,
  omitQuotes: true,
  contextToCustomElements: false,
  staticMarker: '@once',
  effectWrapper: 'effect',
  memoWrapper: 'memo',
  validate: true,
  inlineStyles: true,
  renderers: [],
}

export default DEFAULT_CONFIG
