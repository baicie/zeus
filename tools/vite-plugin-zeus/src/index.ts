import type { Plugin, ResolvedConfig } from 'vite'
import { createDOMCompiler } from '@zeus-js/compiler-dom'
import { transformSync } from '@babel/core'
import { relative } from 'node:path'

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
  const compiler = createDOMCompiler(options.compiler || {})

  return {
    name: 'vite-plugin-zeus',

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    transform(code, id) {
      // 只处理 .jsx, .tsx 文件
      if (!id.match(/\.(jsx|tsx)$/)) return null

      try {
        // 使用 Babel 和 Zeus 编译器转换代码
        const result = transformSync(code, {
          filename: id,
          presets: [],
          plugins: [
            [
              compiler,
              {
                webComponentsMode: options.webComponentsMode || 'shadow',
                optimizeSlots: options.optimizeSlots !== false,
                customElementsPrefix: options.customElementsPrefix,
              },
            ],
          ],
          sourceMaps: true,
          sourceFileName: relative(config.root, id),
        })

        if (!result || !result.code) return null

        return {
          code: result.code,
          map: result.map,
        }
      } catch (e) {
        this.error(`Zeus 编译错误: ${id}\n${e.message}`)
        return null
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

// 导出类型定义
export * from './options'
