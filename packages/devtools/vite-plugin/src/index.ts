import path from 'node:path'

import { transformAsync } from '@babel/core'
import zeusCompiler from '@zeus-js/compiler'

import type { CompilerOptions } from '@zeus-js/compiler'
import type { Plugin, UserConfig } from 'vite'

export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  compiler?: Partial<CompilerOptions>
  diagnostics?: boolean
}

function normalizePatterns(value: RegExp | RegExp[]): RegExp[] {
  return Array.isArray(value) ? value : [value]
}

function createFilter(options: ZeusVitePluginOptions = {}) {
  const include = normalizePatterns(options.include ?? /\.[tj]sx(?:\?.*)?$/)
  const exclude = normalizePatterns(options.exclude ?? /node_modules/)

  return function shouldTransform(id: string): boolean {
    const cleanId = id.replace(/[?#].*$/, '')

    if (exclude.some(pattern => pattern.test(cleanId))) {
      return false
    }

    return include.some(pattern => pattern.test(cleanId))
  }
}

export function createZeus(options: ZeusVitePluginOptions = {}): Plugin {
  const shouldTransform = createFilter(options)

  return {
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    async config(userConfig) {
      const runtimeDomEntry = resolveRuntimeDOMEntry(userConfig.root)

      return {
        ...((await isRolldownVite())
          ? {
              oxc: {
                jsx: 'preserve',
              },
            }
          : {
              esbuild: {
                jsx: 'preserve',
              },
            }),
        resolve: {
          alias: runtimeDomEntry
            ? {
                '@zeus-js/runtime-dom': runtimeDomEntry,
              }
            : undefined,
          dedupe: ['@zeus-js/signal', '@zeus-js/runtime-dom', '@zeus-js/zeus'],
        },
      } satisfies UserConfig
    },

    async transform(code, id) {
      if (!shouldTransform(id)) {
        return null
      }

      const result = await transformAsync(code, {
        filename: id,
        sourceMaps: true,
        plugins: [
          [
            zeusCompiler as unknown as (api: object, opts: object) => object,
            {
              moduleName:
                options.compiler?.moduleName ?? '@zeus-js/runtime-dom',
              generate: 'dom',
              hydratable: false,
              delegateEvents: true,
              ...options.compiler,
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
        map: result.map as unknown as { mappings: string } | null,
      }
    },
  }
}

export default createZeus

export { createZeus as zeus }

async function isRolldownVite(): Promise<boolean> {
  try {
    const vite = (await import('vite')) as Record<string, unknown>

    return (
      typeof vite.rolldownVersion === 'string' ||
      typeof vite.transformWithOxc === 'function'
    )
  } catch {
    return false
  }
}

function resolveRuntimeDOMEntry(root: string | undefined): string | undefined {
  const projectRoot = path.resolve(process.cwd(), root ?? '.')

  try {
    return require.resolve(
      '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js',
      { paths: [projectRoot] },
    )
  } catch {
    // The common app shape depends only on @zeus-js/zeus.
    // Compiler output still imports runtime helpers directly,
    // so resolve runtime-dom through Zeus.
  }

  try {
    const zeusEntry = require.resolve('@zeus-js/zeus', {
      paths: [projectRoot],
    })

    return require.resolve(
      '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js',
      { paths: [zeusEntry] },
    )
  } catch {
    return undefined
  }
}
