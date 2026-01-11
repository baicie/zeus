import type { Plugin as EsbuildPlugin } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { type CompilerOptions, ZeusCompiler } from '../compiler'

export interface EsbuildZeusPluginOptions extends CompilerOptions {
  /**
   * esbuild特有的选项
   */
  esbuild?: {
    /**
     * 是否启用JSX自动导入
     * @default false
     */
    jsxAutoImport?: boolean

    /**
     * JSX工厂函数
     * @default 'React.createElement'
     */
    jsxFactory?: string

    /**
     * JSX片段函数
     * @default 'React.Fragment'
     */
    jsxFragment?: string
  }
}

/**
 * Zeus 框架的 esbuild 插件
 */
export function esbuildPlugin(
  options: EsbuildZeusPluginOptions = {},
): EsbuildPlugin {
  const compiler = new ZeusCompiler(options)

  return {
    name: 'esbuild-plugin-zeus',

    setup(build) {
      // 处理JSX文件
      build.onLoad({ filter: /\.(jsx|tsx)$/ }, async args => {
        const source = await readFile(args.path, 'utf-8')
        const result = compiler.transform(source, args.path, options)

        if (result) {
          return {
            contents: result.code,
            loader: args.path.endsWith('.tsx') ? 'tsx' : 'jsx',
          }
        }

        return {
          contents: source,
          loader: args.path.endsWith('.tsx') ? 'tsx' : 'jsx',
        }
      })

      // 处理TypeScript文件
      build.onLoad({ filter: /\.(ts|js)$/ }, async args => {
        const source = await readFile(args.path, 'utf-8')
        const result = compiler.transform(source, args.path, options)

        if (result) {
          return {
            contents: result.code,
            loader: args.path.endsWith('.ts') ? 'ts' : 'js',
          }
        }

        return {
          contents: source,
          loader: args.path.endsWith('.ts') ? 'ts' : 'js',
        }
      })

      // 处理热更新
      build.onEnd(() => {
        compiler.destroy?.()
      })
    },
  }
}

export default esbuildPlugin
