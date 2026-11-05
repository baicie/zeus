import { createCompilerCache, type CompilerCacheOptions } from './cache'
import { classifyHmrUpdate } from './hmr'
import { compilerVersion, transformModule, type HmrPlan } from './native'
import {
  resolveRuntimeDOMEntry,
  resolveRuntimeSSREntry,
} from './runtime-resolution'

import type { ExistingRawSourceMap, SourceMapInput } from 'rollup'
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
  /** Automatic render-root boundaries. Literal binding patches are opt-in. */
  hmr?: boolean | { preserveBindings?: boolean }
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
  const previousPlans = new Map<string, HmrPlan>()
  const preserveBindings =
    typeof options.hmr === 'object' && options.hmr.preserveBindings === true
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

    async hotUpdate(context) {
      if (
        !enableRootHMR ||
        context.type !== 'update' ||
        this.environment.name !== 'client'
      ) {
        return
      }

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
      compilerCache.invalidate([filename], 'hot-update')
      const classification = classifyHmrUpdate(
        filename,
        previousSources.get(filename),
        nextSource,
      )
      const description = `[Zeus HMR] ${classification.kind} -> ${classification.strategy}: ${filename}`

      // A comment-only edit has no executable update to apply. Returning an
      // empty module list keeps Vite from disposing and remounting the root.
      if (classification.preserveState) {
        this.debug(description)
        return []
      }

      const previous = previousPlans.get(filename)
      if (preserveBindings && previous && shouldTransform(filename)) {
        const next = transformModule({
          source: nextSource,
          filename,
          target: 'dom',
          runtimeModule: options.compiler?.moduleName ?? '@zeus-js/runtime-dom',
          delegateEvents: options.compiler?.delegateEvents ?? true,
          sourceMap: true,
          hmr: true,
        })
        const diagnostic = next.diagnostics.find(
          entry => entry.severity === 'error',
        )
        if (diagnostic) {
          const start = diagnostic.span?.start
          // A previous successful transform is already running. Mark this as
          // a hot update before showing the overlay: Vite otherwise treats
          // an error on its first update as an initial-load error and reloads
          // the page on repair, discarding the retained state.
          this.environment.hot.send({ type: 'update', updates: [] })
          this.environment.hot.send({
            type: 'error',
            err: {
              message: `${diagnostic.code}: ${diagnostic.message}`,
              stack: '',
              plugin: 'vite-plugin-zeus',
              id: filename,
              ...(start
                ? {
                    loc: {
                      file: filename,
                      line: start.line,
                      column: start.column,
                    },
                  }
                : {}),
            },
          })
          this.debug(
            `[Zeus HMR] compile-error -> retain-last-good: ${filename}`,
          )
          return []
        }
        if (
          next.hmrPlan &&
          previous.version === next.hmrPlan.version &&
          previous.signature === next.hmrPlan.signature
        ) {
          // Existing clients keep their module instance; subsequent imports
          // must still compile the edited source rather than a stale response.
          for (const module of context.modules) {
            this.environment.moduleGraph.invalidateModule(
              module,
              new Set(),
              context.timestamp,
              true,
            )
          }
          previousPlans.set(filename, next.hmrPlan)
          previousSources.set(filename, nextSource)
          this.environment.hot.send({
            type: 'custom',
            event: 'zeus:hmr-patch',
            data: { filename, previous, next: next.hmrPlan },
          })
          // Vite's empty update clears an earlier compiler error overlay.
          this.environment.hot.send({ type: 'update', updates: [] })
          this.debug(
            `[Zeus HMR] literal-bindings -> preserve-state: ${filename}`,
          )
          return []
        }
      }
      this.debug(description)
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

      if (enableRootHMR && !isSSR) {
        previousSources.set(filename, code)
        if (result.hmrPlan) previousPlans.set(filename, result.hmrPlan)
        else previousPlans.delete(filename)
      }

      return { code: result.code, map: copySourceMap(result.map) }
    },
  }
}

/**
 * Vite rewrites the source map it receives in place: it fills
 * `sourcesContent`, appends to `x_google_ignoreList` and, in dev, replaces
 * `sources` with paths relative to the module. The cache stores one result
 * per module and target, so handing out the cached map would let the first
 * consumer's normalization leak into every later hit. Each transform returns
 * its own copy of the mutable parts instead.
 */
function copySourceMap(map: SourceMapInput): SourceMapInput {
  if (!map || typeof map === 'string' || !('sources' in map)) return map

  const copy: ExistingRawSourceMap = {
    ...map,
    sources: [...map.sources],
    names: [...map.names],
  }
  if (map.sourcesContent) copy.sourcesContent = [...map.sourcesContent]
  if (map.x_google_ignoreList) {
    copy.x_google_ignoreList = [...map.x_google_ignoreList]
  }

  return copy
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
