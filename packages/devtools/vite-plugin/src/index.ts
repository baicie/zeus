import { transformAsync } from '@babel/core'
import zeusCompiler, {
  CompilerError,
  formatCompilerDiagnostic,
} from '@zeus-js/compiler'

import { createRootHMRPlugin } from './hmr'
import {
  resolveRuntimeDOMEntry,
  resolveRuntimeSSREntry,
} from './runtime-resolution'

import type { CompilerOptions } from '@zeus-js/compiler'
import type { Plugin, UserConfig } from 'vite'

export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  /** Inject dispose-and-remount boundaries for top-level render roots. */
  hmr?: boolean
  /** Runtime module used by Vite SSR transforms. */
  ssrModuleName?: string
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
  let enableRootHMR = false

  return {
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    async config(userConfig) {
      const runtimeDomEntry = resolveRuntimeDOMEntry(userConfig.root)
      const runtimeSSREntry = resolveRuntimeSSREntry(userConfig.root)
      const alias: Record<string, string> = {}

      if (runtimeDomEntry) alias['@zeus-js/runtime-dom'] = runtimeDomEntry
      if (runtimeSSREntry) alias['@zeus-js/runtime-ssr'] = runtimeSSREntry

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
          alias: Object.keys(alias).length > 0 ? alias : undefined,
          dedupe: [
            '@zeus-js/signal',
            '@zeus-js/runtime-dom',
            '@zeus-js/runtime-ssr',
            '@zeus-js/zeus',
          ],
        },
      } satisfies UserConfig
    },

    configResolved(config) {
      enableRootHMR = options.hmr !== false && config.command === 'serve'
    },

    async transform(code, id, transformOptions) {
      const filename = cleanModuleId(id)
      const isSSR = transformOptions?.ssr === true

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
                hydratable: false,
                ...options.compiler,
                moduleName: isSSR
                  ? (options.ssrModuleName ?? '@zeus-js/runtime-ssr')
                  : (options.compiler?.moduleName ?? '@zeus-js/runtime-dom'),
                generate: isSSR ? 'ssr' : 'dom',
                ...(isSSR ? { delegateEvents: false } : {}),
              } satisfies Partial<CompilerOptions>,
            ],
            ...(enableRootHMR && !transformOptions?.ssr
              ? [createRootHMRPlugin]
              : []),
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
