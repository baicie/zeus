import type { Compilation, Compiler as WebpackCompiler } from 'webpack'
import { type CompilerOptions, ZeusCompiler } from '../compiler'
import { resolve } from 'node:path'

export interface WebpackZeusPluginOptions extends CompilerOptions {
  /**
   * Webpack特有的选项
   */
  webpack?: {
    /**
     * 是否启用多线程编译
     * @default false
     */
    parallel?: boolean

    /**
     * 缓存策略
     * @default 'memory'
     */
    cacheStrategy?: 'memory' | 'filesystem' | 'none'
  }
}

/**
 * Zeus 框架的 Webpack 插件
 */
export class WebpackZeusPlugin {
  private options: WebpackZeusPluginOptions

  constructor(options: WebpackZeusPluginOptions = {}) {
    this.options = options
  }

  apply(_compiler: WebpackCompiler) {
    // 监听文件变化
    _compiler.hooks.compilation.tap(
      'ZeusPlugin',
      (compilation: Compilation) => {
        compilation.hooks.buildModule.tap('ZeusPlugin', module => {
          // 处理模块构建
        })

        // 处理热更新
        if (compilation.compiler.options.mode === 'development') {
          // HMR逻辑可以通过其他方式实现
        }
      },
    )

    // 添加loader
    _compiler.options.module?.rules?.push({
      test: /\.(jsx|tsx|js|ts)$/,
      exclude: /node_modules/,
      use: [
        {
          loader: resolve('./webpack-loader'),
          options: this.options,
        },
      ],
    })
  }
}

/**
 * Webpack loader for Zeus
 */
export function webpackLoader(this: any, source: string): string | undefined {
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

export default WebpackZeusPlugin
