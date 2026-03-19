import { compiler } from '@zeus-js/compiler-core'

export interface CompilerOptions {
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
  compiler?: {
    /**
     * 源代码类型 (js/jsx/ts/tsx)
     */
    sourceType?: 'js' | 'jsx' | 'ts' | 'tsx'
    /**
     * 是否启用实验性功能
     * @default false
     */
    experimental?: boolean
    /**
     * 目标 ES 版本
     * @default 'es2020'
     */
    target?: string
    /**
     * 是否压缩代码
     * @default false
     */
    minify?: boolean
  }

  /**
   * Web Component 宏编译选项
   * 用于处理 defineProps/defineEmits/defineExpose 等宏
   */
  webComponentMacros?: WebComponentMacroOptions

  /**
   * 包含的文件扩展名
   * @default ['.jsx', '.tsx', '.js', '.ts']
   */
  include?: string[]

  /**
   * 排除的文件模式
   * @default [/node_modules/]
   */
  exclude?: RegExp[]
}

export interface WebComponentMacroOptions {
  /**
   * 是否启用宏编译
   * @default true
   */
  enable?: boolean

  /**
   * 自动检测宏使用并启用编译
   * 当设置为 true 时，如果代码中使用了指定的宏函数，将自动启用编译
   * @default true
   */
  autoDetect?: boolean

  /**
   * 宏导入模块路径
   * 可以配置多个可能的导入路径，用于自动检测
   * @default ['@zeus-js/web-components', '@addons/web-components']
   */
  module?: string | string[]

  /**
   * 保留原始宏调用 (用于调试)
   * @default false
   */
  preserve?: boolean

  /**
   * 要处理的宏函数列表
   * 可以配置只处理部分宏函数
   * @default ['defineProps', 'defineEmits', 'defineExpose', 'withDefaults']
   */
  macros?: string[]

  /**
   * 转换模式
   * - 'remove': 移除宏调用，保留参数
   * - 'noop': 保留宏调用（用于运行时处理）
   * @default 'remove'
   */
  mode?: 'remove' | 'noop'

  /**
   * 是否提取宏定义信息
   * 提取后的信息可用于运行时类型检查
   * @default false
   */
  extractDefinitions?: boolean
}

/**
 * 预定义的宏函数配置
 */
export const DEFAULT_MACRO_FUNCTIONS = [
  'defineProps',
  'defineEmits',
  'defineExpose',
  'withDefaults',
] as const

/**
 * 预定义的宏模块路径
 */
export const DEFAULT_MACRO_MODULES: string[] = [
  '@zeus-js/web-components',
  '@addons/web-components',
  'web-components',
]

export interface TransformResult {
  code: string
  map?: any
  dependencies?: string[]
}

export interface Compiler {
  /**
   * 转换代码
   */
  transform(
    code: string,
    id: string,
    options?: CompilerOptions,
  ): TransformResult | null

  /**
   * 处理热更新
   */
  handleHotUpdate?(ctx: any): any[] | void

  /**
   * 获取插件名称
   */
  getName(): string

  /**
   * 销毁编译器
   */
  destroy?(): void
}

export class ZeusCompiler implements Compiler {
  private options: CompilerOptions

  constructor(options: CompilerOptions = {}) {
    this.options = {
      hmr: true,
      webComponentsMode: 'shadow',
      optimizeSlots: true,
      webComponentMacros: {
        enable: true,
        autoDetect: true,
        module: DEFAULT_MACRO_MODULES,
        preserve: false,
        macros: [...DEFAULT_MACRO_FUNCTIONS],
        mode: 'remove',
        extractDefinitions: false,
      },
      include: ['.jsx', '.tsx', '.js', '.ts'],
      exclude: [/node_modules/],
      ...options,
    }
  }

  transform(
    code: string,
    id: string,
    options?: CompilerOptions,
  ): TransformResult | null {
    const opts = { ...this.options, ...options }

    if (!this.shouldProcessFile(id, opts)) {
      return null
    }

    try {
      const compileOptions = {
        sourceType: opts.compiler?.sourceType || this.getSourceType(id),
        experimental: opts.compiler?.experimental || false,
        target: opts.compiler?.target || 'es2020',
        minify: opts.compiler?.minify || false,
      }

      let result
      try {
        result = compiler(code, compileOptions)
      } catch (e) {
        console.error('[Zeus] Compiler exception for', id, ':', e)
        return null
      }

      if (result && result.success) {
        return {
          code: result.code,
        }
      } else {
        console.error('[Zeus] Compile error for', id, ':', result?.error)
        return null
      }
    } catch (error) {
      console.error(`\n\x1b[31m\x1b[1merror\x1b[0m (Zeus): ${error}\n`)
      return null
    }
  }

  handleHotUpdate?(ctx: any): any[] | void {
    if (this.options.hmr === false) return

    const { file, modules } = ctx
    if (!this.shouldProcessFile(file, this.options)) return

    return modules
  }

  getName(): string {
    return 'zeus-compiler'
  }

  destroy(): void {
    // 清理资源
  }

  shouldProcessFile(id: string, options: CompilerOptions): boolean {
    if (!id.endsWith('.jsx') && !id.endsWith('.tsx')) {
      return false
    }

    if (options.exclude?.some(pattern => pattern.test(id))) {
      return false
    }

    const extensions = this.extractExtensions(options.include || [])

    return extensions.some(ext => id.endsWith(ext))
  }

  extractExtensions(include: string[]): string[] {
    const extensions = new Set<string>()

    for (const pattern of include) {
      if (pattern.includes('*')) {
        const match = pattern.match(/\{([^}]+)\}/)
        if (match) {
          const exts = match[1].split(',')
          exts.forEach(ext => {
            extensions.add(ext.startsWith('.') ? ext : `.${ext}`)
          })
        } else {
          const extMatch = pattern.match(/\*\.(\w+)/)
          if (extMatch) {
            extensions.add(`.${extMatch[1]}`)
          }
        }
      } else {
        extensions.add(pattern.startsWith('.') ? pattern : `.${pattern}`)
      }
    }

    return Array.from(extensions)
  }

  private getSourceType(id: string): 'js' | 'jsx' | 'ts' | 'tsx' {
    if (id.endsWith('.tsx')) return 'tsx'
    if (id.endsWith('.jsx')) return 'jsx'
    if (id.endsWith('.ts')) return 'ts'
    return 'js'
  }

  getOptions(): CompilerOptions {
    return { ...this.options }
  }
}

export function createZeusCompiler(options?: CompilerOptions): ZeusCompiler {
  return new ZeusCompiler(options)
}
