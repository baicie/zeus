import { isObject } from '@zeus/shared'

export interface CompilerOptions {
  isNative?: boolean
  optimizeImports?: boolean
  sourceMap?: boolean
}

export interface CompilerOutput {
  code: string
  map?: object
  ast?: object
}

export function compile(
  source: string,
  options: CompilerOptions = {}
): CompilerOutput {
  // TODO: 实现编译逻辑
  return {
    code: source,
    map: options.sourceMap ? {} : undefined,
  }
}

export function transform(ast: object, options: CompilerOptions = {}): any {
  if (!isObject(ast)) {
    throw new Error('AST must be an object')
  }

  // TODO: 实现 AST 转换逻辑
  return ast
}
