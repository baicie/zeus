/**
 * Framework-independent renderer boundary for hosts such as virtualized grids.
 * The adapter owns framework-specific rendering; the host only owns keys and
 * container lifetimes.
 */
export interface RendererAdapter<
  Container,
  Data,
  Context = unknown,
  Handle = unknown,
> {
  mount(container: Container, data: Data, context: Context): Handle
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
  render(entries: readonly RendererEntry<Container, Data, Context>[]): void
  setAdapter(adapter: RendererAdapter<Container, Data, Context, Handle>): void
  dispose(): void
}

interface MountedRenderer<Container, Data, Context, Handle> {
  key: PropertyKey
  adapter: RendererAdapter<Container, Data, Context, Handle>
  container: Container
  data: Data
  context: Context
  handle: Handle
}

const rendererHostDisposedError = 'Renderer host has already been disposed'

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
  let currentAdapter = adapter
  let disposed = false
  let mounted = new Map<
    PropertyKey,
    MountedRenderer<Container, Data, Context, Handle>
  >()
  const pendingDisposals = new Set<
    MountedRenderer<Container, Data, Context, Handle>
  >()

  function assertActive(): void {
    if (disposed) throw new Error(rendererHostDisposedError)
  }

  function disposeEntries(
    entries: readonly MountedRenderer<Container, Data, Context, Handle>[],
  ): unknown {
    let firstError: unknown
    for (const entry of entries) {
      try {
        entry.adapter.dispose(entry.handle)
        pendingDisposals.delete(entry)
      } catch (error) {
        pendingDisposals.add(entry)
        firstError ??= error
      }
    }
    return firstError
  }

  return {
    render(entries) {
      assertActive()
      const pendingError = disposeEntries(Array.from(pendingDisposals))
      if (pendingError) throw pendingError

      const next = new Map<
        PropertyKey,
        RendererEntry<Container, Data, Context>
      >()
      for (const entry of entries) {
        if (next.has(entry.key)) {
          throw new Error(`Duplicate renderer key: ${String(entry.key)}`)
        }
        next.set(entry.key, entry)
      }

      try {
        for (const [key, entry] of mounted) {
          if (!next.has(key)) {
            mounted.delete(key)
            const disposeError = disposeEntries([entry])
            if (disposeError) throw disposeError
          }
        }

        for (const entry of entries) {
          const previous = mounted.get(entry.key)
          if (
            previous &&
            previous.adapter === currentAdapter &&
            Object.is(previous.container, entry.container)
          ) {
            currentAdapter.update(previous.handle, entry.data, entry.context)
            mounted.set(entry.key, {
              ...previous,
              data: entry.data,
              context: entry.context,
            })
            continue
          }

          if (previous) {
            mounted.delete(entry.key)
            const disposeError = disposeEntries([previous])
            if (disposeError) throw disposeError
          }

          mounted.set(entry.key, {
            key: entry.key,
            adapter: currentAdapter,
            container: entry.container,
            data: entry.data,
            context: entry.context,
            handle: currentAdapter.mount(
              entry.container,
              entry.data,
              entry.context,
            ),
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
      if (nextAdapter === currentAdapter) return
      const pendingError = disposeEntries(Array.from(pendingDisposals))
      if (pendingError) throw pendingError

      const previousEntries = Array.from(mounted.values())
      mounted.clear()
      const disposeError = disposeEntries(previousEntries)
      if (disposeError) throw disposeError
      currentAdapter = nextAdapter

      try {
        for (const entry of previousEntries) {
          mounted.set(entry.key, {
            key: entry.key,
            adapter: currentAdapter,
            container: entry.container,
            data: entry.data,
            context: entry.context,
            handle: currentAdapter.mount(
              entry.container,
              entry.data,
              entry.context,
            ),
          })
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
      const entries = Array.from(mounted.values())
      mounted = new Map()
      const firstError = disposeEntries(entries)
      if (firstError) throw firstError
    },
  }
}
