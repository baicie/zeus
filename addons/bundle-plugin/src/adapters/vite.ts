import type { Plugin } from 'vite'
import { type CompilerOptions, ZeusCompiler } from '../compiler'

export interface ViteZeusPluginOptions extends CompilerOptions {
  /**
   * Vite特有的选项
   */
  vite?: {
    /**
     * 是否强制预编译
     * @default false
     */
    forcePreBuild?: boolean

    /**
     * SSR构建模式
     * @default false
     */
    ssr?: boolean
  }
}

/**
 * Zeus 框架的 Vite 插件
 */
export function vitePlugin(options: ViteZeusPluginOptions = {}): Plugin {
  const compiler = new ZeusCompiler(options)

  return {
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    buildStart() {
      if (options.vite?.forcePreBuild) {
        // 强制预编译逻辑
      }
    },

    transform(code, id) {
      return compiler.transform(code, id, options)
    },

    handleHotUpdate(ctx) {
      return compiler.handleHotUpdate?.(ctx)
    },

    buildEnd() {
      compiler.destroy?.()
    },
  }
}

export default vitePlugin
