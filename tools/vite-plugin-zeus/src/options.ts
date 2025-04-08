import type { DOMCompilerOptions } from '@zeus-js/compiler-dom'

/**
 * Zeus Vite 插件选项
 */
export interface ZeusPluginOptions {
  /**
   * 是否启用热更新
   * @default true
   */
  hmr?: boolean

  /**
   * 是否自动导入组件
   * @default false
   */
  autoImport?: boolean

  /**
   * 包含的文件匹配模式
   * @default ['.jsx', '.tsx']
   */
  include?: string | RegExp | (string | RegExp)[]

  /**
   * 排除的文件匹配模式
   * @default [/node_modules/]
   */
  exclude?: string | RegExp | (string | RegExp)[]

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
  compiler?: DOMCompilerOptions
}

/**
 * 解析并设置默认选项
 */
export function resolveOptions(
  options: ZeusPluginOptions
): Required<ZeusPluginOptions> {
  return {
    hmr: options.hmr !== false,
    autoImport: options.autoImport === true,
    include: options.include || ['.jsx', '.tsx'],
    exclude: options.exclude || [/node_modules/],
    customElementsPrefix: options.customElementsPrefix || '',
    webComponentsMode: options.webComponentsMode || 'shadow',
    optimizeSlots: options.optimizeSlots !== false,
    compiler: options.compiler || {},
  }
}
