import { type CompilerOptions, ZeusCompiler } from '../compiler'

export default function zeusRspackLoader(
  this: any,
  source: string,
): string | undefined {
  const options: CompilerOptions = this.getOptions()
  const compiler = new ZeusCompiler(options)

  const result = compiler.transform(source, this.resourcePath, options)

  if (result) {
    // 处理source map
    if (result.map) {
      this.callback(null, result.code, result.map)
    } else {
      this.callback(null, result.code)
    }
  } else {
    this.callback(null, source)
  }

  return undefined
}
