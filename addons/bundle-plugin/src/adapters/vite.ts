import type { Plugin } from 'vite'
import { type CompilerOptions, ZeusCompiler } from '../compiler'
import * as fs from 'node:fs/promises'

export interface ViteZeusPluginOptions extends CompilerOptions {
  vite?: {
    forcePreBuild?: boolean
    ssr?: boolean
  }
}

export function vitePlugin(options: ViteZeusPluginOptions = {}): Plugin {
  const compiler = new ZeusCompiler(options)

  return {
    name: 'vite-plugin-zeus',

    enforce: 'pre',

    async load(id) {
      // 跳过虚拟模块、查询参数和node_modules
      if (
        id.includes('?') ||
        id.includes('\x00') ||
        id.includes('node_modules') ||
        (!id.endsWith('.tsx') && !id.endsWith('.jsx'))
      ) {
        return null
      }

      try {
        const code = await fs.readFile(id, 'utf-8')
        const result = compiler.transform(code, id, options)

        if (result && result.code) {
          return {
            code: result.code,
            map: result.map,
          }
        }
      } catch (e) {
        console.error('[Zeus] Load error for', id, ':', e)
      }

      return null
    },

    handleHotUpdate(ctx) {
      if (options.hmr === false) return

      const { file, modules, server: devServer } = ctx

      if (!shouldProcessFile(file)) {
        return
      }

      console.log(`[Zeus HMR] Hot updating: ${file}`)

      if (devServer) {
        devServer.hot.send('zeus:hmr-update', {
          type: 'rerender',
          id: 'root',
        })
      }

      return modules
    },

    buildEnd() {
      compiler.destroy?.()
    },
  }

  function shouldProcessFile(id: string): boolean {
    if (id.includes('?') || id.includes('\x00')) {
      return false
    }

    const include = options.include || ['.jsx', '.tsx', '.js', '.ts']
    const exclude = options.exclude || [/node_modules/]

    if (exclude.some(pattern => pattern.test(id))) {
      return false
    }

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
