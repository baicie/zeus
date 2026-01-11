import type { Plugin, TransformResult } from 'rollup'
import { type CompilerOptions, ZeusCompiler } from '../compiler'

export interface RollupZeusPluginOptions extends CompilerOptions {
  /**
   * Rollup特有的选项
   */
  rollup?: {
    /**
     * 是否包含source map
     * @default true
     */
    sourcemap?: boolean

    /**
     * 转换钩子顺序
     * @default 'pre'
     */
    enforce?: 'pre' | 'post'
  }
}

/**
 * Zeus 框架的 Rollup 插件
 */
export function rollupPlugin(options: RollupZeusPluginOptions = {}): Plugin {
  const compiler = new ZeusCompiler(options)

  return {
    name: 'rollup-plugin-zeus',
    transform(code, id) {
      const result = compiler.transform(code, id, options)

      if (result) {
        const transformResult: TransformResult = {
          code: result.code,
          map: options.rollup?.sourcemap !== false ? result.map : undefined,
        }
        return transformResult
      }

      return null
    },

    buildEnd() {
      compiler.destroy?.()
    },

    watchChange(id) {
      // 处理文件变化
      if (compiler.handleHotUpdate) {
        compiler.handleHotUpdate({ file: id, modules: [] })
      }
    },
  }
}

export default rollupPlugin
