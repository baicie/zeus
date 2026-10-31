import { createCompilerCache, type CompilerCacheOptions } from './cache'
import { classifyHmrUpdate } from './hmr'
import { compilerVersion, transformModule } from './native'
import {
  resolveRuntimeDOMEntry,
  resolveRuntimeSSREntry,
} from './runtime-resolution'

import type { Plugin, UserConfig } from 'vite'

export type { CompilerCacheEvent, CompilerCacheOptions } from './cache'

export interface ZeusNativeCompilerOptions {
  moduleName?: string
  delegateEvents?: boolean
  /**
   * Cache native compiler results per plugin instance. Pass an observer to
   * collect hit/miss/invalidation events, or false to disable the cache.
   */
  cache?: boolean | CompilerCacheOptions
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

const runtimePackages = [
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/runtime-ssr',
  '@zeus-js/zeus',
] as const

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
  const previousSources = new Map<string, string>()
  const compilerCache = createCompilerCache<ReturnType<typeof transformModule>>(
    normalizeCompilerCacheOptions(options.compiler?.cache),
  )
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
          dedupe: [...runtimePackages],
        },
        optimizeDeps: {
          // Compiler-injected imports appear after dependency scanning. Keep
          // these ESM packages together, including linked workspace entries and
          // signal's public/internal imports, instead of mixing optimized copies.
          exclude: [...runtimePackages],
        },
      } satisfies UserConfig
    },

    configResolved(config) {
      enableRootHMR = options.hmr !== false && config.command === 'serve'
    },

    async handleHotUpdate(context) {
      if (!enableRootHMR) return

      const filename = cleanModuleId(context.file)
      if (
        !shouldTransform(filename) &&
        !/\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/i.test(filename)
      ) {
        return
      }

      let nextSource: string
      try {
        nextSource = await context.read()
      } catch {
        return
      }
      compilerCache.invalidate(
        collectAffectedModuleIds(context.modules, filename),
        'hot-update',
      )
      const classification = classifyHmrUpdate(
        filename,
        previousSources.get(filename),
        nextSource,
      )
      this.debug(
        `[Zeus HMR] ${classification.kind} -> ${classification.strategy}: ${filename}`,
      )

      // A comment-only edit has no executable update to apply. Returning an
      // empty module list keeps Vite from disposing and remounting the root.
      if (classification.preserveState) return []
    },

    async transform(code, id, transformOptions) {
      const filename = cleanModuleId(id)
      const isSSR = transformOptions?.ssr === true

      if (!shouldTransform(filename)) {
        return null
      }

      const cacheInput = {
        compilerVersion,
        filename,
        source: code,
        target: isSSR ? ('ssr' as const) : ('dom' as const),
        runtimeModule: isSSR
          ? (options.ssrModuleName ?? '@zeus-js/runtime-ssr')
          : (options.compiler?.moduleName ?? '@zeus-js/runtime-dom'),
        delegateEvents: isSSR
          ? false
          : (options.compiler?.delegateEvents ?? true),
        sourceMap: true,
        hmr: enableRootHMR && !isSSR,
        importGraph: readImportGraph(this, filename),
      }

      let result = compilerCache.get(cacheInput)
      if (!result) {
        result = transformModule({
          source: code,
          filename,
          target: cacheInput.target,
          runtimeModule: cacheInput.runtimeModule,
          delegateEvents: cacheInput.delegateEvents,
          sourceMap: cacheInput.sourceMap,
          hmr: cacheInput.hmr,
        })
        compilerCache.set(cacheInput, result)
      }

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

      if (enableRootHMR && !isSSR) previousSources.set(filename, code)

      return { code: result.code, map: result.map }
    },
  }
}

export default createZeus

export { createZeus as zeus }

function normalizeCompilerCacheOptions(
  cache: boolean | CompilerCacheOptions | undefined,
): CompilerCacheOptions {
  if (cache === false) return { enabled: false }
  if (cache === true || cache === undefined) return { enabled: true }
  return { ...cache, enabled: cache.enabled !== false }
}

function readImportGraph(
  context: unknown,
  filename: string,
): readonly string[] {
  const getModuleInfo = (
    context as {
      getModuleInfo?: (
        id: string,
      ) => { importedIds?: readonly string[] } | null | undefined
    }
  ).getModuleInfo

  if (typeof getModuleInfo !== 'function') return []

  try {
    return getModuleInfo.call(context, filename)?.importedIds ?? []
  } catch {
    return []
  }
}

interface HotUpdateModule {
  id: string | null
  importers?: ReadonlySet<HotUpdateModule>
}

function collectAffectedModuleIds(
  modules: readonly HotUpdateModule[] | undefined,
  filename: string,
): string[] {
  const queue = [...(modules ?? [])]
  const seen = new Set<string>([filename])

  while (queue.length > 0) {
    const module = queue.shift()!
    if (!module.id) continue

    if (seen.has(module.id)) {
      for (const importer of module.importers ?? []) queue.push(importer)
      continue
    }

    seen.add(module.id)
    for (const importer of module.importers ?? []) queue.push(importer)
  }

  return [...seen]
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
