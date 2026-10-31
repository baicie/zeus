// Mirrors the `@zeus-js/compiler-native` contract; `__tests__/types.ts` keeps
// the two declarations mutually assignable.

export interface SourcePosition {
  offset: number
  line: number
  column: number
}

export interface SourceSpan {
  start: SourcePosition
  end: SourcePosition
}

export interface CompilerDiagnostic {
  code: string
  message: string
  severity: 'error' | 'warning'
  filename: string
  hint?: string
  span?: SourceSpan
}

export interface HydrationBindingPlan {
  id: number
  kind: string
  name?: string
  once: boolean
}

export interface HydrationNodePlan {
  id: string
  nodeId: number
  kind: string
  optional: boolean
  tagName?: string
  bindings: Array<HydrationBindingPlan>
}

export interface HydrationComponentPlan {
  id: number
  templateId: string
  nodes: Array<HydrationNodePlan>
}

export interface HydrationPlan {
  version: number
  components: Array<HydrationComponentPlan>
}

export interface RawSourceMap {
  version: number
  file?: string
  sources: Array<string>
  sourceRoot?: string
  sourcesContent: Array<string | null>
  names: Array<string>
  mappings: string
}

export interface TransformModuleOptions {
  source: string
  filename: string
  target: 'dom' | 'ssr'
  runtimeModule: string
  delegateEvents: boolean
  sourceMap: boolean
  hmr?: boolean
  pureDefineElement?: boolean
}

export interface TransformModuleResult {
  code: string
  map: RawSourceMap | null
  diagnostics: Array<CompilerDiagnostic>
  hydrationPlan: HydrationPlan | null
}

export interface WasmCompiler {
  /**
   * Rejects with a `TypeError` for invalid options and with
   * `[ZEUS_COMPILER_WASM_TRAP]` when the instance traps; compiler errors are
   * returned as `diagnostics`.
   */
  transformModule(
    options: TransformModuleOptions,
  ): Promise<TransformModuleResult>
}

export interface WorkerCompiler extends WasmCompiler {
  terminate(): void
}

export type CompilerModuleSource =
  | BufferSource
  | WebAssembly.Module
  | Response
  | PromiseLike<BufferSource | WebAssembly.Module | Response>

/** URL of the compiler binary inside this package. */
export declare const wasmURL: URL

export declare function compileCompilerModule(
  source: CompilerModuleSource,
): Promise<WebAssembly.Module>

export declare function loadCompiler(
  source: CompilerModuleSource,
): Promise<WasmCompiler>

export declare function createWorkerCompiler(
  worker: Worker,
  module: WebAssembly.Module,
  options?: { timeout?: number },
): WorkerCompiler
