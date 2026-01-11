import { type CompilerOptions, ZeusCompiler } from '../compiler'

interface LoaderOptions extends CompilerOptions {
  isServer?: boolean
}

export default function zeusWebpackLoader(
  this: any,
  source: string,
): string | undefined {
  const options: LoaderOptions = this.getOptions()
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
