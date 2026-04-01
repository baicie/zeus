import type { Plugin, RolldownPlugin, TransformResult } from 'rolldown'
import { type CompilerOptions, ZeusCompiler } from '../compiler'
import { makeIdFiltersToMatchWithQuery } from 'rolldown/filter'

export interface RolldownZeusPluginOptions extends CompilerOptions {
  /**
   * Rolldown 特有的选项
   */
  rolldown?: {
    /**
     * 转换钩子顺序
     * @default 'pre'
     */
    enforce?: 'pre' | 'post'

    /**
     * 是否生成 source map
     * @default true
     */
    sourcemap?: boolean

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
  const { rolldown = {} } = options
  const { enforce = 'pre', sourcemap = true } = rolldown

  const pluginName = 'rolldown-plugin-zeus'

  const excludePatterns = options.exclude
    ? options.exclude.map(r => (r instanceof RegExp ? r.source : r))
    : undefined

  const plugin: Plugin = {
    name: pluginName,

    // transform hook - 使用 filter 模式
    transform: {
      order: enforce,
      filter: {
        id: {
          include: makeIdFiltersToMatchWithQuery(/\.[jt]sx$/),
          exclude:
            excludePatterns && excludePatterns.length > 0
              ? excludePatterns
              : undefined,
        },
      },
      handler(code, id) {
        const result = compiler.transform(code, id, options)

        if (result) {
          const transformResult: TransformResult = {
            code: result.code,
            map: sourcemap && result.map ? result.map : undefined,
          }
          return transformResult
        }

        return null
      },
    },

    // build lifecycle hooks
    buildStart() {
      // 初始化编译器
    },

    moduleParsed(moduleInfo) {
      // 模块解析完成时的处理
    },

    buildEnd(err?: Error) {
      if (err) {
        console.error(`[${pluginName}] Build error:`, err)
      }
      if (compiler.destroy) {
        compiler.destroy()
      }
    },
  }

  return plugin
}

export default rolldownPlugin
