import type {
  Compiler as RspackCompiler,
  RspackPluginInstance,
} from '@rspack/core'
import { type CompilerOptions, ZeusCompiler } from '../compiler'
import { resolve } from 'node:path'

export interface RspackZeusPluginOptions extends CompilerOptions {
  /**
   * Rspack特有的选项
   */
  rspack?: {
    /**
     * 是否启用实验性功能
     * @default false
     */
    experimental?: boolean

    /**
     * 性能优化级别
     * @default 'balanced'
     */
    performanceLevel?: 'speed' | 'balanced' | 'size'
  }
}

/**
 * Zeus 框架的 Rspack 插件
 */
export class RspackZeusPlugin implements RspackPluginInstance {
  private options: RspackZeusPluginOptions

  constructor(options: RspackZeusPluginOptions = {}) {
    this.options = options
  }

  apply(_compiler: RspackCompiler): void {
    // 添加loader
    _compiler.options.module?.rules?.push({
      test: /\.(jsx|tsx|js|ts)$/,
      exclude: /node_modules/,
      use: [
        {
          loader: resolve('./rspack-loader'),
          options: this.options,
        },
      ],
    })

    // 处理优化
    if (this.options.rspack?.performanceLevel) {
      _compiler.options.optimization = {
        ..._compiler.options.optimization,
        // 根据性能级别调整优化策略
      }
    }
  }
}

/**
 * Rspack loader for Zeus
 */
export function rspackLoader(this: any, source: string): string | undefined {
  const options = this.getOptions()
  const compiler = new ZeusCompiler(options)

  const result = compiler.transform(source, this.resourcePath, options)

  if (result) {
    // 处理source map
    if (result.map) {
      this.callback(null, result.code, result.map)
    } else {
      this.callback(null, result.code)
    }
    return undefined
  }

  this.callback(null, source)
  return undefined
}

export default RspackZeusPlugin
