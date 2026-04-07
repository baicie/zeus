import type { CompilerOptions } from './shared/types'

export type { CompilerOptions }

export const DEFAULT_CONFIG: Required<CompilerOptions> = {
  moduleName: 'zeus',
  generate: 'dom',
  hydratable: false,
  delegateEvents: true,
  delegatedEvents: [],
  builtIns: [
    'For',
    'Show',
    'Switch',
    'Match',
    'Portal',
    'Suspense',
    'ErrorBoundary',
    'Index',
    'Merge',
    'Dynamic',
  ],
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
}

export function mergeConfig(user: CompilerOptions): Required<CompilerOptions> {
  return Object.assign({}, DEFAULT_CONFIG, user) as Required<CompilerOptions>
}
