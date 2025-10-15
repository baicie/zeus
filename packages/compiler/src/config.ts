export interface CompilerConfig {
  moduleName: string
  generate: string
  hydratable: boolean
  delegateEvents: boolean
  delegatedEvents: string[]
  builtIns: string[]
  requireImportSource: boolean
  wrapConditionals: boolean
  omitNestedClosingTags: boolean
  omitLastClosingTag: boolean
  omitQuotes: boolean
  contextToCustomElements: boolean
  staticMarker: string
  effectWrapper: string
  memoWrapper: string
  validate: boolean
}

const defaultConfig: CompilerConfig = {
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
}

export default defaultConfig
