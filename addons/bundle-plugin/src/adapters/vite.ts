import type { Plugin } from 'vite'
import type { CompilerOptions } from '../compiler'
import { compiler } from '@zeus-js/compiler-core'

export interface ViteZeusPluginOptions extends CompilerOptions {
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
}

export function vitePlugin(options: ViteZeusPluginOptions = {}): Plugin {
  return {
    name: 'vite-plugin-zeus',
    enforce: 'pre',
    async transform(source, id) {
      // 清理 id（移除查询参数）
      id = id.replace(/\?.*$/, '')

      // if (!filter(id)) {
      //   return null
      // }

      try {
        const result = compiler(source)

        if (result && result.code) {
          return {
            code: result.code,
          }
        }
      } catch (error) {
        console.error(`[Zeus] Transform error for ${id}:`, error)
      }

      return null
    },
  }
}

export default vitePlugin

export { ZeusCompiler, createZeusCompiler } from '../compiler'
export type { CompilerOptions, TransformResult } from '../compiler'
