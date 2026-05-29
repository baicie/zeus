import { createRequire } from 'node:module'
import path from 'node:path'

import { transformAsync } from '@babel/core'
import zeusCompiler from '@zeus-js/compiler'

import type { CompilerOptions } from '@zeus-js/compiler'
import type { Plugin, UserConfig } from 'vite'

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
              delegateEvents: true,
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
  const requireFromProject = createRequire(
    path.join(projectRoot, 'package.json'),
  )

  try {
    return requireFromProject.resolve(
      '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js',
    )
  } catch {
    // The common app shape depends only on @zeus-js/zeus. Compiler output still
    // imports runtime helpers directly, so resolve runtime-dom through Zeus.
  }

  try {
    const zeusEntry = requireFromProject.resolve('@zeus-js/zeus')
    const requireFromZeus = createRequire(zeusEntry)

    return requireFromZeus.resolve(
      '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js',
    )
  } catch {
    return undefined
  }
}
