import type { CodegenOptions } from './options'

export function generate(ast: any, options: CodegenOptions = {}) {
  const context = createCodegenContext(ast, options)
  const { push, indent, deindent } = context

  // 生成代码
  genNode(ast, context)

  return {
    code: context.code,
    // ... 其他生成结果
  }
}
