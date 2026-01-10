// packages/compiler-core/native/compiler.d.ts

export declare class Compiler {
  constructor(options: CompileOptions)
  compile(source: string): CompileResult
}

export interface CompileOptions {
  target?: string
  minify?: boolean
}

export interface CompileResult {
  code: string
  map?: string
}
