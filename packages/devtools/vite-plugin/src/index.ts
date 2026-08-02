import path from 'node:path'

import { transformAsync } from '@babel/core'
import zeusCompiler, {
  CompilerError,
  formatCompilerDiagnostic,
} from '@zeus-js/compiler'

import type { CompilerOptions } from '@zeus-js/compiler'
import type { Plugin, UserConfig } from 'vite'

export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  compiler?: Partial<CompilerOptions>
}

function normalizePatterns(value: RegExp | RegExp[]): RegExp[] {
  return Array.isArray(value) ? value : [value]
}

function matchesPattern(pattern: RegExp, value: string): boolean {
  const lastIndex = pattern.lastIndex
  pattern.lastIndex = 0

  try {
    return pattern.test(value)
  } finally {
    pattern.lastIndex = lastIndex
  }
}

function cleanModuleId(id: string): string {
  return id.replace(/[?#].*$/, '')
}

function createFilter(options: ZeusVitePluginOptions = {}) {
  const include = normalizePatterns(options.include ?? /\.[tj]sx(?:\?.*)?$/)
  const exclude = normalizePatterns(options.exclude ?? /node_modules/)

  return function shouldTransform(id: string): boolean {
    const cleanId = cleanModuleId(id)

    if (exclude.some(pattern => matchesPattern(pattern, cleanId))) {
      return false
    }

    return include.some(pattern => matchesPattern(pattern, cleanId))
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
      const filename = cleanModuleId(id)

      if (!shouldTransform(filename)) {
        return null
      }

      try {
        const result = await transformAsync(code, {
          filename,
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
      } catch (error) {
        if (!(error instanceof CompilerError)) throw error

        const diagnostic = error.diagnostic
        const start = diagnostic.span?.start

        this.error({
          name: error.name,
          message: formatCompilerDiagnostic(diagnostic),
          cause: error,
          id: diagnostic.filename ?? filename,
          loc: start
            ? {
                line: start.line,
                column: start.column,
              }
            : undefined,
          pluginCode: diagnostic.code,
          meta: {
            zeusDiagnostic: diagnostic,
          },
        })
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
