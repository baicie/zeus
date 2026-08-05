# @zeus-js/compiler (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import * as _babel_core from '@babel/core'
import { SourceSpan, SourcePosition } from '@zeus-js/compiler-shared'
export * from '@zeus-js/compiler-shared'

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
  generate: 'dom' | 'ssr'
  /**
   * Indicate whether the output should contain hydratable markers.
   * @default true
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

export declare const CompilerErrorCode: {
  readonly UNSUPPORTED_SPREAD_ATTRIBUTE: 'ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE'
  readonly UNSUPPORTED_SPREAD_CHILD: 'ZEUS_UNSUPPORTED_SPREAD_CHILD'
  readonly UNSUPPORTED_FRAGMENT: 'ZEUS_UNSUPPORTED_FRAGMENT'
  readonly UNSUPPORTED_FRAGMENT_CHILD: 'ZEUS_UNSUPPORTED_FRAGMENT_CHILD'
  readonly UNSUPPORTED_COMPONENT_PROP: 'ZEUS_UNSUPPORTED_COMPONENT_PROP'
  readonly EMPTY_EXPRESSION: 'ZEUS_EMPTY_EXPRESSION'
  readonly INVALID_TRANSFORM_RESULT: 'ZEUS_INVALID_TRANSFORM_RESULT'
  readonly UNSUPPORTED_NODE: 'ZEUS_UNSUPPORTED_NODE'
  readonly INVALID_BUILTIN_USAGE: 'ZEUS_INVALID_BUILTIN_USAGE'
  readonly UNSUPPORTED_SSR_BUILTIN: 'ZEUS_UNSUPPORTED_SSR_BUILTIN'
  readonly UNSUPPORTED_SSR_PROPERTY: 'ZEUS_UNSUPPORTED_SSR_PROPERTY'
  readonly UNSUPPORTED_SSR_RAW_TEXT_CHILD: 'ZEUS_UNSUPPORTED_SSR_RAW_TEXT_CHILD'
  readonly INVALID_REF_USAGE: 'ZEUS_INVALID_REF_USAGE'
}
export type CompilerErrorCode =
  (typeof CompilerErrorCode)[keyof typeof CompilerErrorCode]

export type CompilerDiagnosticSeverity = 'error' | 'warning'
export interface CompilerDiagnostic {
  code: CompilerErrorCode
  severity: CompilerDiagnosticSeverity
  message: string
  hint?: string
  filename?: string
  span?: SourceSpan
}
export declare function formatCompilerDiagnostic(
  diagnostic: CompilerDiagnostic,
): string

export interface CompilerErrorOptions {
  code: CompilerErrorCode
  message: string
  hint?: string
  filename?: string
  span?: SourceSpan
}
export declare class CompilerError extends Error {
  readonly diagnostic: CompilerDiagnostic
  readonly code: CompilerDiagnostic['code']
  readonly severity: 'error'
  readonly hint?: string
  readonly filename?: string
  readonly span?: SourceSpan
  readonly loc?: Pick<SourcePosition, 'line' | 'column'>
  constructor(options: CompilerErrorOptions)
}

declare const _default: (
  api: _babel_core.PluginAPI,
  options: CompilerOptions | null | undefined,
  dirname: string,
) => _babel_core.PluginObject<object & _babel_core.PluginPass<object>>

export { _default as default }
```
