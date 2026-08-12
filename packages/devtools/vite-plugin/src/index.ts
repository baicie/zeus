import { transformModule } from './native'
import {
  resolveRuntimeDOMEntry,
  resolveRuntimeSSREntry,
} from './runtime-resolution'

import type { Plugin, UserConfig } from 'vite'

export interface ZeusNativeCompilerOptions {
  moduleName?: string
  delegateEvents?: boolean
}

export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[]
  exclude?: RegExp | RegExp[]
  /** Inject dispose-and-remount boundaries for top-level render roots. */
  hmr?: boolean
  /** Runtime module used by Vite SSR transforms. */
  ssrModuleName?: string
  compiler?: ZeusNativeCompilerOptions
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

      const result = transformModule({
        source: code,
        filename,
        target: isSSR ? 'ssr' : 'dom',
        runtimeModule: isSSR
          ? (options.ssrModuleName ?? '@zeus-js/runtime-ssr')
          : (options.compiler?.moduleName ?? '@zeus-js/runtime-dom'),
        delegateEvents: isSSR
          ? false
          : (options.compiler?.delegateEvents ?? true),
        sourceMap: true,
        hmr: enableRootHMR && !isSSR,
      })

      const diagnostic = result.diagnostics.find(
        entry => entry.severity === 'error',
      )
      if (diagnostic) {
        const start = diagnostic.span?.start
        this.error({
          name: 'ZeusCompilerDiagnostic',
          message: `${diagnostic.code}: ${diagnostic.message}`,
          id: diagnostic.filename || filename,
          loc: start ? { line: start.line, column: start.column } : undefined,
          pluginCode: diagnostic.code,
          meta: { zeusDiagnostic: diagnostic },
        })
      }

      return { code: result.code, map: result.map }
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
