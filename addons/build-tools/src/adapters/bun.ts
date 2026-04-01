import type { BunPlugin } from 'bun'
import { type CompilerOptions, ZeusCompiler } from '../compiler'

export interface BunZeusPluginOptions extends CompilerOptions {
  /**
   * Bun特有的选项
   */
  bun?: {
    /**
     * 是否启用原生Bun优化
     * @default true
     */
    nativeOptimization?: boolean

    /**
     * 是否启用宏支持
     * @default false
     */
    macros?: boolean
  }
}

/**
 * Zeus 框架的 Bun 插件
 */
export function bunPlugin(options: BunZeusPluginOptions = {}): BunPlugin {
  const compiler = new ZeusCompiler(options)

  // 辅助方法
  const getLoaderForFile = (path: string): 'jsx' | 'tsx' | 'js' | 'ts' => {
    if (path.endsWith('.tsx')) return 'tsx'
    if (path.endsWith('.jsx')) return 'jsx'
    if (path.endsWith('.ts')) return 'ts'
    return 'js'
  }

  return {
    name: 'bun-plugin-zeus',

    setup(build) {
      // 处理JSX和TypeScript文件
      build.onLoad({ filter: /\.(jsx|tsx|js|ts)$/ }, async args => {
        const source = await Bun.file(args.path).text()
        const result = compiler.transform(source, args.path, options)

        if (result) {
          return {
            contents: result.code,
            loader: getLoaderForFile(args.path),
          }
        }

        return {
          contents: source,
          loader: getLoaderForFile(args.path),
        }
      })

      // 处理热重载
      build.onResolve({ filter: /\.hot\.(jsx|tsx|js|ts)$/ }, args => {
        if (options.hmr !== false) {
          // 处理热重载逻辑
          return {
            path: args.path.replace('.hot.', '.'),
            namespace: 'zeus-hmr',
          }
        }
      })

      build.onEnd(() => {
        compiler.destroy?.()
      })
    },
  }
}

export default bunPlugin
