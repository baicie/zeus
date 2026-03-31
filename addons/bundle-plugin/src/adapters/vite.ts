import type { Plugin } from 'vite'
import type { CompilerOptions } from '../compiler'
import { compiler } from '@zeus-js/compiler-core'
import { type FilterPattern, createFilter } from 'vite'
import { makeIdFiltersToMatchWithQuery } from 'rolldown/filter'
import color from 'picocolors'

export interface ViteZeusPluginOptions extends Omit<
  CompilerOptions,
  'include' | 'exclude'
> {
  /**
   * Vite 特定选项
   */
  vite?: {
    /**
     * 是否在构建前强制预编译
     * @default false
     */
    forcePreBuild?: boolean
    /**
     * SSR 模式
     * @default false
     */
    ssr?: boolean
    /**
     * 开发模式下注入 dev 代码
     * @default true
     */
    dev?: boolean
  }
  /**
   * 包含的文件模式
   * @default /\.[jt]sx?$/
   */
  include?: FilterPattern
  /**
   * 排除的文件模式
   */
  exclude?: FilterPattern
}

export function vitePlugin(options: ViteZeusPluginOptions = {}): Plugin[] {
  const { include = /\.[jt]sx$/, exclude } = options
  const filter = createFilter(include, exclude)

  return [
    {
      name: 'vite-plugin-zeus',
      config() {
        const isRolldownVite = this && 'rolldownVersion' in this.meta
        const esbuildKey = (isRolldownVite ? 'oxc' : 'esbuild') as 'esbuild'
        return {
          [esbuildKey]: {
            include: /\.ts$/,
          },
          optimizeDeps: isRolldownVite
            ? {
                rolldownOptions: { transform: { jsx: 'preserve' } },
              }
            : {},
        }
      },

      transform: {
        order: undefined,
        filter: {
          id: {
            include: include
              ? makeIdFiltersToMatchWithQuery(include)
              : undefined,
            exclude: exclude
              ? makeIdFiltersToMatchWithQuery(exclude)
              : undefined,
          },
        },
        async handler(code, id) {
          const [filepath] = id.split('?')

          if (!filter(id) && !filter(filepath)) {
            return
          }

          const result = compiler(code)
          if (result.error) {
            const errorPrefix = `\n╔═══════[Zeus] Compile Error ════════\n║ File: ${filepath}\n╚═══════════════════════════════════════\n`
            console.error(errorPrefix, color.red(result.error))
            return
          } else if (result.code) {
            return {
              code: result.code,
            }
          } else {
            console.error(
              color.red(`[Zeus] Unexpected compile result for ${filepath}:`),
            )
            return
          }
        },
      },
    },
  ]
}

export default vitePlugin
