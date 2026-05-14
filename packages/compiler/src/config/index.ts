import { extend } from '@zeus-js/shared'

import { DEFAULT_RENDERER_MODULE } from '../runtime'
/**
 * Compiler configuration interface.
 */
export interface CompilerOptions {
  /**
   * The name of the runtime module to import the methods from.
   */
  moduleName: string
  /**
   * The output mode of the compiler. Can be "dom"(default), "ssr". "dom" is standard output. "ssr" is for server side rendering of strings.
   * @default 'dom'
   */
  generate: 'dom'
  /**
   * Indicate whether the output should contain hydratable markers.
   * @default false
   */
  hydratable: boolean
  /**
   * Boolean to indicate whether to enable automatic event delegation on camelCase.
   * @default true
   */
  delegateEvents: boolean
  /**
   * Array of Component exports from module, that aren't included by default with the library. This plugin will automatically import them if it comes across them in the JSX.
   * @default []
   */
  delegatedEvents: string[]
  /**
   * Array of Component exports from module, that aren't included by default with the library. This plugin will automatically import them if it comes across them in the JSX.
   * @default []
   */
  builtIns: string[]
  /**
   * When set to a string value, this option restricts JSX transformation to only files that contain a specific JSX import source pragma comment. The plugin will only transform JSX in files that include a comment with `@jsxImportSource` followed by the specified value. If the comment is missing or specifies a different import source, the transformation is skipped for that file.
   * @default false
   */
  // requireImportSource: boolean
  /**
   * Boolean indicates whether smart conditional detection should be used. This optimizes simple boolean expressions and ternaries in JSX.
   * @default true
   */
  wrapConditionals: boolean
  omitNestedClosingTags: boolean
  /**
   * Removes tags from the template output if they have no closing parents and are the last element. This may not work in all browser-like environments the same. The solution has been tested again Chrome/Edge/Firefox/Safari.
   * @default true
   */
  omitLastClosingTag: boolean
  /**
   * Removes quotes for html attributes when possible from the template output. This may not work in all browser-like environments the same. The solution has been tested again Chrome/Edge/Firefox/Safari.
   * @default true
   */
  omitQuotes: boolean
  /**
   * Boolean indicates whether to set current render context on Custom Elements and slots. Useful for seemless Context API with Web Components.
   * @default false
   */
  contextToCustomElements: boolean
  /**
   * Comment decorator string indicates the static expression, used to tell the compiler not to wrap them by `effect` function, defaults to `@once`.
   * @default '@once'
   */
  staticMarker: string
  /**
   * This plugin leverages a heuristic for reactive wrapping and lazy evaluation of JSX expressions. This option indicates the reactive wrapper function name (`effect`), defaults to `effect`.
   * @default 'effect'
   */
  effectWrapper: string
  /**
   * Memos let you efficiently use a derived value in many reactive computations. This option indicates the memo function name, defaults to `memo`.
   * @default 'memo'
   */
  memoWrapper: string
  /**
   * Checks for properly formed HTML by checking for elements that would not be allowed in certain parent elements. This validation isn't complete but includes places where browser would "correct" it and break the DOM walks.
   * @default true
   */
  validate: boolean
  /**
   * Boolean indicates whether to inline styles into the template output.
   * @default true
   */
  inlineStyles: boolean
}

export const DEFAULT_OPTIONS: CompilerOptions = {
  moduleName: DEFAULT_RENDERER_MODULE,
  generate: 'dom',
  hydratable: false,
  delegateEvents: true,
  delegatedEvents: [],
  builtIns: [],
  // requireImportSource: false,
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

/**
 * Resolve the compiler options by merging the default options with the provided options.
 * @param options - The compiler options to resolve.
 * @returns The resolved compiler options.
 */
export function resolveConfig(options: CompilerOptions): CompilerOptions {
  return extend(DEFAULT_OPTIONS, options)
}
