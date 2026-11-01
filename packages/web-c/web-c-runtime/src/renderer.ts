/**
 * Framework renderer boundary (RFC-011). A host such as a virtualized grid owns
 * keys and containers; an adapter owns everything a framework renders inside a
 * container. Neither this module nor the Web Component runtime interprets
 * ReactNode, VNode or framework instances.
 */

/** Identifies one mount of one key. A remount starts a new session. */
export interface RendererSession {
  /** The stable logical key the host rendered. */
  readonly key: PropertyKey
  /** Strictly increasing per host and never reused, so stale work is detectable. */
  readonly generation: number
  /** Aborted before the adapter disposes this mount. */
  readonly signal: AbortSignal
}

export interface RendererAdapter<
  Container,
  Data,
  Context = unknown,
  Handle = unknown,
> {
  mount(
    container: Container,
    data: Data,
    context: Context,
    session: RendererSession,
  ): Handle
  update(handle: Handle, data: Data, context: Context): void
  dispose(handle: Handle): void
}

export interface RendererEntry<Container, Data, Context = unknown> {
  key: PropertyKey
  container: Container
  data: Data
  context: Context
}

export interface RendererHost<
  Container,
  Data,
  Context = unknown,
  Handle = unknown,
> {
  /**
   * Reconciles the visible entries: a key whose adapter and container are
   * unchanged is updated, a changed container remounts, and missing keys are
   * disposed. All disposals run before any mount, so keys can swap
   * containers in one call. Keys and containers must each be unique.
   */
  render(entries: readonly RendererEntry<Container, Data, Context>[]): void
  /** Disposes every handle and remounts the current entries with `adapter`. */
  setAdapter(adapter: RendererAdapter<Container, Data, Context, Handle>): void
  dispose(): void
}

export type RendererErrorCode =
  | 'ZEUS_RENDERER_DISPOSED'
  | 'ZEUS_RENDERER_DUPLICATE_KEY'
  | 'ZEUS_RENDERER_DUPLICATE_CONTAINER'
  | 'ZEUS_RENDERER_ADAPTER_FAILURE'
  | 'ZEUS_RENDERER_CONTAINER_MISMATCH'

/** Creates an error carrying a stable `[code]` prefix and the original cause. */
export function createRendererError(
  code: RendererErrorCode,
  message: string,
  cause?: unknown,
): Error {
  const error = new Error(`[${code}] ${message}`) as Error & { cause?: unknown }
  if (cause !== undefined) error.cause = cause
  return error
}

interface MountedRenderer<Container, Data, Context, Handle> {
  key: PropertyKey
  adapter: RendererAdapter<Container, Data, Context, Handle>
  container: Container
  data: Data
  context: Context
  handle: Handle
  controller: AbortController
}

/**
 * Reconciles keyed renderer entries without knowing how a framework renders.
 * A key keeps its adapter handle across reorder/update operations. Changing a
 * container for an existing key remounts that entry because the adapter mount
 * contract owns the container binding.
 */
export function createRendererHost<
  Container,
  Data,
  Context = unknown,
  Handle = unknown,
>(
  adapter: RendererAdapter<Container, Data, Context, Handle>,
): RendererHost<Container, Data, Context, Handle> {
  type Mounted = MountedRenderer<Container, Data, Context, Handle>

  let currentAdapter = adapter
  let disposed = false
  let generation = 0
  const mounted = new Map<PropertyKey, Mounted>()
  const pendingDisposals = new Set<Mounted>()
  let pendingAdapterSwap:
    | {
        adapter: RendererAdapter<Container, Data, Context, Handle>
        entries: Mounted[]
        disposedEntries: Set<Mounted>
      }
    | undefined

  function assertActive(): void {
    if (disposed) {
      throw createRendererError(
        'ZEUS_RENDERER_DISPOSED',
        'The renderer host has already been disposed.',
      )
    }
  }

  function mountEntry(
    entry: Pick<Mounted, 'key' | 'container' | 'data' | 'context'>,
  ): Mounted {
    const controller = new AbortController()
    const session: RendererSession = {
      key: entry.key,
      generation: ++generation,
      signal: controller.signal,
    }
    try {
      return {
        ...entry,
        adapter: currentAdapter,
        controller,
        handle: currentAdapter.mount(
          entry.container,
          entry.data,
          entry.context,
          session,
        ),
      }
    } catch (error) {
      controller.abort()
      throw adapterFailure('mount', entry.key, error)
    }
  }

  function disposeEntries(entries: readonly Mounted[]): unknown {
    let firstError: unknown
    for (const entry of entries) {
      // Stop the session before the adapter tears down what it rendered.
      entry.controller.abort()
      try {
        entry.adapter.dispose(entry.handle)
        pendingDisposals.delete(entry)
      } catch (error) {
        pendingDisposals.add(entry)
        firstError ??= adapterFailure('dispose', entry.key, error)
      }
    }
    return firstError
  }

  return {
    render(entries) {
      assertActive()
      if (pendingAdapterSwap) {
        throw createRendererError(
          'ZEUS_RENDERER_ADAPTER_FAILURE',
          'A failed renderer adapter swap must complete before rendering.',
        )
      }
      const pendingError = disposeEntries(Array.from(pendingDisposals))
      if (pendingError) throw pendingError

      const next = new Map<PropertyKey, Container>()
      const containerKeys = new Map<Container, PropertyKey>()
      for (const entry of entries) {
        if (next.has(entry.key)) {
          throw createRendererError(
            'ZEUS_RENDERER_DUPLICATE_KEY',
            `Renderer key ${String(entry.key)} appears more than once.`,
          )
        }
        if (containerKeys.has(entry.container)) {
          throw createRendererError(
            'ZEUS_RENDERER_DUPLICATE_CONTAINER',
            `Renderer keys ${String(containerKeys.get(entry.container))} and ${String(entry.key)} use the same container.`,
          )
        }
        next.set(entry.key, entry.container)
        containerKeys.set(entry.container, entry.key)
      }

      try {
        // Release every container that changes owner before mounting into
        // any of them. Otherwise a key moving into a container that another
        // key still owns would be cleared when that key is disposed later.
        const stale: Mounted[] = []
        for (const [key, entry] of mounted) {
          if (
            !next.has(key) ||
            entry.adapter !== currentAdapter ||
            !Object.is(entry.container, next.get(key))
          ) {
            mounted.delete(key)
            stale.push(entry)
          }
        }
        const disposeError = disposeEntries(stale)
        if (disposeError) throw disposeError

        for (const entry of entries) {
          const previous = mounted.get(entry.key)
          if (!previous) {
            mounted.set(entry.key, mountEntry(entry))
            continue
          }
          try {
            currentAdapter.update(previous.handle, entry.data, entry.context)
          } catch (error) {
            throw adapterFailure('update', entry.key, error)
          }
          mounted.set(entry.key, {
            ...previous,
            data: entry.data,
            context: entry.context,
          })
        }
      } catch (error) {
        const active = Array.from(mounted.values())
        mounted.clear()
        disposeEntries(active)
        throw error
      }
    },

    setAdapter(nextAdapter) {
      assertActive()
      if (!pendingAdapterSwap && nextAdapter === currentAdapter) return

      if (!pendingAdapterSwap) {
        const pendingError = disposeEntries(Array.from(pendingDisposals))
        if (pendingError) throw pendingError
        pendingAdapterSwap = {
          adapter: nextAdapter,
          entries: Array.from(mounted.values()),
          disposedEntries: new Set(),
        }
      } else {
        pendingAdapterSwap.adapter = nextAdapter
      }

      let firstError: unknown
      for (const entry of pendingAdapterSwap.entries) {
        if (pendingAdapterSwap.disposedEntries.has(entry)) continue
        const disposeError = disposeEntries([entry])
        if (disposeError) firstError ??= disposeError
        else pendingAdapterSwap.disposedEntries.add(entry)
      }
      if (firstError) throw firstError

      const previousEntries = pendingAdapterSwap.entries
      currentAdapter = pendingAdapterSwap.adapter
      pendingAdapterSwap = undefined
      mounted.clear()

      try {
        for (const entry of previousEntries) {
          mounted.set(entry.key, mountEntry(entry))
        }
      } catch (error) {
        const active = Array.from(mounted.values())
        mounted.clear()
        disposeEntries(active)
        throw error
      }
    },

    dispose() {
      if (disposed) {
        const pendingError = disposeEntries(Array.from(pendingDisposals))
        if (pendingError) throw pendingError
        return
      }
      disposed = true
      const entries = pendingAdapterSwap
        ? pendingAdapterSwap.entries.filter(
            entry => !pendingAdapterSwap?.disposedEntries.has(entry),
          )
        : Array.from(mounted.values())
      mounted.clear()
      pendingAdapterSwap = undefined
      const firstError = disposeEntries([
        ...new Set([...pendingDisposals, ...entries]),
      ])
      if (firstError) throw firstError
    },
  }
}

function adapterFailure(
  phase: 'mount' | 'update' | 'dispose',
  key: PropertyKey,
  error: unknown,
): Error {
  // Keep an already-coded error (for example from a nested host) intact.
  if (error instanceof Error && error.message.startsWith('[ZEUS_RENDERER_')) {
    return error
  }
  return createRendererError(
    'ZEUS_RENDERER_ADAPTER_FAILURE',
    `Renderer ${phase} failed for key ${String(key)}.`,
    error,
  )
}
