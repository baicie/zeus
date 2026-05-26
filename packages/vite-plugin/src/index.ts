import { transformAsync } from '@babel/core'
import zeusCompiler from '@zeus-js/compiler'

import type { CompilerOptions } from '@zeus-js/compiler'
import type { Plugin } from 'vite'

export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  moduleName?: string
  dev?: boolean
  sourcemap?: boolean
}

function createZeus(options: ZeusVitePluginOptions = {}): Plugin {
  const include = normalizePatterns(options.include ?? /\.[tj]sx$/)
  const exclude = normalizePatterns(options.exclude ?? /node_modules/)
  let viteRoot = ''

  return {
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    configResolved(config) {
      viteRoot = config.root
    },

    config() {
      return {
        oxc: {
          jsx: 'preserve',
        },
        resolve: {
          alias: {
            '@zeus-js/runtime-dom': `${viteRoot}/node_modules/@zeus-js/runtime-dom`,
            '@zeus-js/zeus': `${viteRoot}/node_modules/@zeus-js/zeus`,
          },
        },
      }
    },

    async transform(code, id) {
      if (!shouldTransform(id, include, exclude)) {
        return null
      }

      const result = await transformAsync(code, {
        filename: id,
        sourceMaps: options.sourcemap ?? true,
        plugins: [
          [
            zeusCompiler,
            {
              moduleName: options.moduleName ?? '@zeus-js/runtime-dom',
              generate: 'dom',
              hydratable: false,
              delegateEvents: false,
            } satisfies Partial<CompilerOptions>,
          ],
        ],
        parserOpts: {
          sourceType: 'module',
          plugins: ['typescript', 'jsx'],
        },
        generatorOpts: {
          retainLines: false,
          compact: false,
          jsescOption: {
            minimal: true,
          },
        },
      })

      if (!result?.code) return null

      return {
        code: result.code,
        map: result.map ?? null,
      }
    },
  }
}

export default createZeus

export { createZeus as zeus }

function normalizePatterns(value: RegExp | RegExp[]): RegExp[] {
  return Array.isArray(value) ? value : [value]
}

function shouldTransform(
  id: string,
  include: RegExp[],
  exclude: RegExp[],
): boolean {
  if (exclude.some(pattern => pattern.test(id))) return false
  return include.some(pattern => pattern.test(id))
}
