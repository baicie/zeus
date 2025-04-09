import type { Plugin, ResolvedConfig } from 'vite'
import { createDOMCompiler } from '@zeus-js/compiler-dom'
import { transformSync } from '@babel/core'

export interface ZeusPluginOptions {
  /**
   * 是否启用 HMR
   * @default true
   */
  hmr?: boolean

  /**
   * 自定义元素名称前缀
   * @default undefined
   */
  customElementsPrefix?: string

  /**
   * Web Components 模式
   * @default 'shadow'
   */
  webComponentsMode?: 'shadow' | 'light' | 'auto'

  /**
   * 是否优化 slots
   * @default true
   */
  optimizeSlots?: boolean

  /**
   * 编译器选项
   */
  compiler?: Record<string, any>
}

/**
 * Zeus 框架的 Vite 插件
 */
export default function zeusPlugin(options: ZeusPluginOptions = {}): Plugin {
  let config: ResolvedConfig
  const compiler = createDOMCompiler(
    options.compiler || {
      moduleName: '@zeus-js/runtime-dom',
    }
  )

  return {
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    transform(code, id) {
      if (!id.match(/\.(jsx|tsx)$/)) return null

      const result = transformSync(code, {
        filename: id,
        presets: [],
        plugins: [compiler],
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
        ast: false,
        sourceMaps: true,
        configFile: false,
        babelrc: false,
      })

      if (!result || !result.code) return null

      return {
        code: result.code,
        map: result.map,
      }
    },

    // 配置 HMR
    handleHotUpdate(ctx) {
      if (options.hmr === false) return

      // 处理 HMR 逻辑
      const { file, modules } = ctx
      if (!file.match(/\.(jsx|tsx)$/)) return

      // 返回受影响的模块
      return modules
    },
  }
}

export { zeusPlugin }

// 导出类型定义
export * from './options'
