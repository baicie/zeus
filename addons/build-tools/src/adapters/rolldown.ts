import type { RolldownPlugin } from 'rolldown'
import { type CompilerOptions, ZeusCompiler } from '../compiler'

export interface RolldownZeusPluginOptions extends CompilerOptions {
  /**
   * Rolldown特有的选项
   */
  rolldown?: {
    /**
     * 是否启用增量编译
     * @default true
     */
    incremental?: boolean

    /**
     * 并行处理数量
     * @default 4
     */
    parallelism?: number
  }
}

/**
 * Zeus 框架的 Rolldown 插件
 */
export function rolldownPlugin(
  options: RolldownZeusPluginOptions = {},
): RolldownPlugin {
  const compiler = new ZeusCompiler(options)

  return {
    name: 'rolldown-plugin-zeus',
    transform: {
      handler(code, id) {
        return compiler.transform(code, id, options)
      },
    },

    buildEnd() {
      compiler.destroy?.()
    },
  }
}

export default rolldownPlugin
