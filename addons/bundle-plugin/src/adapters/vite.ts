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

    transform(code, id) {
      return compiler.transform(code, id, options)
    },

    handleHotUpdate(ctx) {
      if (options.hmr === false) return

      const { file, modules, server: devServer } = ctx

      // Check if this is a component file
      if (!shouldProcessFile(file)) {
        return
      }

      console.log(`[Zeus HMR] Hot updating: ${file}`)

      // Use global HMR runtime to notify clients (Vue-like approach)
      if (devServer) {
        devServer.hot.send('zeus:hmr-update', {
          type: 'rerender',
          id: 'root',
        })
      }

      // Return affected modules for proper HMR
      return modules
    },

    buildEnd() {
      compiler.destroy?.()
    },
  }

  function shouldProcessFile(id: string): boolean {
    const include = options.include || ['.jsx', '.tsx', '.js', '.ts']
    const exclude = options.exclude || [/node_modules/]

    // Check exclude patterns
    if (exclude.some(pattern => pattern.test(id))) {
      return false
    }

    // Check include extensions
    const extensions = extractExtensions(include)
    return extensions.some(ext => id.endsWith(ext))
  }

  function extractExtensions(include: string[]): string[] {
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
}

export default vitePlugin
