import { type CompilerOptions, ZeusCompiler } from '../compiler'

export default function zeusTurbopackLoader(
  source: string,
  context: any,
): string | undefined {
  const options: CompilerOptions = context.getOptions?.() || {}
  const compiler = new ZeusCompiler(options)

  const result = compiler.transform(source, context.resourcePath, options)

  if (result) {
    // 处理异步操作
    const callback = context.async?.() || context.callback
    if (callback) {
      callback(null, result.code, result.map)
    }
  } else {
    context.callback?.(null, source)
  }

  return undefined
}
