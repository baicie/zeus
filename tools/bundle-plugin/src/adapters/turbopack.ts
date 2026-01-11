import type { NextConfig } from 'next'
import { type CompilerOptions, ZeusCompiler } from '../compiler'
import { resolve } from 'node:path'

export interface TurbopackZeusPluginOptions extends CompilerOptions {
  /**
   * Turbopack特有的选项
   */
  turbopack?: {
    /**
     * 是否启用实验性功能
     * @default false
     */
    experimental?: boolean

    /**
     * 内存限制
     * @default '1GB'
     */
    memoryLimit?: string
  }
}

/**
 * Zeus 框架的 Turbopack 集成
 * 主要通过 Next.js 的 webpack 配置来集成
 */
export function createTurbopackConfig(
  options: TurbopackZeusPluginOptions = {},
): Partial<NextConfig> {
  return {
    webpack: (config, { isServer }) => {
      // 添加Zeus loader
      config.module?.rules?.push({
        test: /\.(jsx|tsx|js|ts)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: resolve('./webpack-loader'),
            options: {
              ...options,
              isServer,
            },
          },
        ],
      })

      // 根据环境调整配置
      if (options.turbopack?.experimental) {
        config.experiments = {
          ...config.experiments,
          // 启用实验性功能
        }
      }

      return config
    },
  }
}

/**
 * 独立的Turbopack loader
 */
export function turbopackLoader(source: string, context: any) {
  const options = context.getOptions()
  const compiler = new ZeusCompiler(options)

  const result = compiler.transform(source, context.resourcePath, options)

  if (result) {
    // 处理异步操作
    const callback = context.async()
    callback(null, result.code, result.map)
  } else {
    context.callback(null, source)
  }
}

export default createTurbopackConfig
