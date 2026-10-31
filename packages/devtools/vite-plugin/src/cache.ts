import { createHash } from 'node:crypto'

export type CompilerCacheEventType = 'hit' | 'miss' | 'invalidate' | 'skip'

export type CompilerCacheMissReason =
  | 'cold'
  | 'source-changed'
  | 'cache-disabled'

export type CompilerCacheHitReason = 'cached'

export type CompilerCacheInvalidateReason = 'hot-update' | 'manual'

export interface CompilerCacheEvent {
  readonly type: CompilerCacheEventType
  readonly filename: string
  readonly target: 'dom' | 'ssr'
  readonly reason:
    | CompilerCacheHitReason
    | CompilerCacheMissReason
    | CompilerCacheInvalidateReason
  readonly key?: string
}

export interface CompilerCacheOptions {
  readonly enabled?: boolean
  readonly onEvent?: (event: CompilerCacheEvent) => void
}

export interface CompilerCacheInput {
  readonly compilerVersion: string
  readonly filename: string
  readonly source: string
  readonly target: 'dom' | 'ssr'
  readonly runtimeModule: string
  readonly delegateEvents: boolean
  readonly sourceMap: boolean
  readonly hmr: boolean
}

interface CacheEntry<T> {
  readonly filename: string
  readonly target: 'dom' | 'ssr'
  readonly result: T
}

export interface CompilerCache<T> {
  get(input: CompilerCacheInput): T | undefined
  set(input: CompilerCacheInput, result: T): void
  invalidate(
    filenames: readonly string[],
    reason?: CompilerCacheInvalidateReason,
  ): void
  snapshot(): {
    readonly enabled: boolean
    readonly entries: number
    readonly hits: number
    readonly misses: number
    readonly invalidations: number
  }
}

/**
 * Creates a per-plugin compiler cache. Entries are intentionally scoped to a
 * single Vite plugin instance so a dev server cannot reuse output from a
 * different compiler configuration or project.
 *
 * The compiler transforms one module at a time: its output depends only on
 * the key inputs, never on other modules, so imports are not part of the key.
 * Each module and target keeps only its latest entry.
 */
export function createCompilerCache<T>(
  options: CompilerCacheOptions = {},
): CompilerCache<T> {
  const enabled = options.enabled !== false
  const entries = new Map<string, CacheEntry<T>>()
  const latestKeyByModule = new Map<string, string>()
  let hits = 0
  let misses = 0
  let invalidations = 0

  const emit = (event: CompilerCacheEvent): void => {
    try {
      options.onEvent?.(event)
    } catch {
      // Cache diagnostics are observers. A broken metrics hook must not
      // change compiler behavior.
    }
  }

  return {
    get(input) {
      if (!enabled) {
        emit({
          type: 'skip',
          filename: input.filename,
          target: input.target,
          reason: 'cache-disabled',
        })
        return undefined
      }

      const key = createCompilerCacheKey(input)
      const entry = entries.get(key)
      if (entry) {
        hits++
        emit({
          type: 'hit',
          filename: input.filename,
          target: input.target,
          reason: 'cached',
          key,
        })
        return entry.result
      }

      misses++
      emit({
        type: 'miss',
        filename: input.filename,
        target: input.target,
        reason:
          latestKeyByModule.get(moduleKey(input)) === undefined
            ? 'cold'
            : 'source-changed',
        key,
      })
      return undefined
    },

    set(input, result) {
      if (!enabled) return

      const key = createCompilerCacheKey(input)
      const module = moduleKey(input)
      const superseded = latestKeyByModule.get(module)
      if (superseded !== undefined && superseded !== key) {
        entries.delete(superseded)
      }
      entries.set(key, {
        filename: input.filename,
        target: input.target,
        result,
      })
      latestKeyByModule.set(module, key)
    },

    invalidate(filenames, reason = 'manual') {
      if (!enabled) return

      const modules = new Set(filenames.map(normalizeModuleId))
      for (const [key, entry] of entries) {
        if (!modules.has(normalizeModuleId(entry.filename))) continue

        entries.delete(key)
        invalidations++
        emit({
          type: 'invalidate',
          filename: entry.filename,
          target: entry.target,
          reason,
          key,
        })
      }

      for (const [module, key] of latestKeyByModule) {
        if (!entries.has(key)) latestKeyByModule.delete(module)
      }
    },

    snapshot() {
      return {
        enabled,
        entries: entries.size,
        hits,
        misses,
        invalidations,
      }
    },
  }
}

export function createCompilerCacheKey(input: CompilerCacheInput): string {
  return digest(
    JSON.stringify({
      compilerVersion: input.compilerVersion,
      filename: normalizeModuleId(input.filename),
      source: digest(input.source),
      target: input.target,
      runtimeModule: input.runtimeModule,
      delegateEvents: input.delegateEvents,
      sourceMap: input.sourceMap,
      hmr: input.hmr,
    }),
  )
}

function moduleKey(input: CompilerCacheInput): string {
  return `${normalizeModuleId(input.filename)}\0${input.target}`
}

function normalizeModuleId(id: string): string {
  return id.replace(/[?#].*$/, '')
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
