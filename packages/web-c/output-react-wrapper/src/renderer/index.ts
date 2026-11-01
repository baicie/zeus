// React Framework Renderer Adapter (RFC-011). ReactNode, Hooks, Context and
// Portals are interpreted only here; the Web Component runtime and the
// renderer host only see the container and the opaque handle.
import { Fragment, StrictMode, createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import type {
  RendererAdapter,
  RendererErrorCode,
  RendererSession,
} from '@zeus-js/web-c-runtime'
import type { ReactNode } from 'react'
import type { Root } from 'react-dom/client'

export interface ReactRendererHandle {
  readonly container: Element
  readonly state: 'mounted' | 'disposed'
}

export interface ReactRendererOptions {
  /** Render each root inside `<StrictMode>`. */
  strict?: boolean
  /** Prefix for `useId` values, so ids stay unique across many roots. */
  identifierPrefix?: string
  /**
   * Receives errors React 19 reports for a root outside `mount`, `update` and
   * `dispose`, for example from a state update or an effect after the call
   * returned. Errors during those calls are thrown to the host instead.
   * Without this option the error goes to `globalThis.reportError`, or to
   * `console.error` where `reportError` does not exist.
   */
  onError?: (error: unknown, session: RendererSession) => void
}

export type ReactRenderFunction<Data, Context> = (
  data: Data,
  context: Context,
  session: RendererSession,
) => ReactNode

interface MountedRoot {
  root: Root
  container: Element
  session: RendererSession
  /** Incremented for every commit; the render probe records the last one. */
  revision: number
  rendered: number
  /** True only while a synchronous mount, update or dispose runs. */
  capturing: boolean
  failure: { error: unknown } | undefined
}

// Rendered before the cell in every commit. If React defers the work, for
// example because the call happens inside an outer React commit, the probe
// does not run before `flushSync` returns.
function RenderProbe(props: { mounted: MountedRoot; revision: number }): null {
  props.mounted.rendered = props.revision
  return null
}

/**
 * Creates an adapter that renders `render(data, context, session)` into a
 * dedicated React root per container. Mount and update commit synchronously
 * (`flushSync`), so the host sees the rendered DOM when the call returns.
 *
 * Call the host's `render`, `setAdapter` and `dispose` (and so this adapter's
 * `mount`, `update` and `dispose`) outside React rendering and commits, for
 * example from an event handler or a scheduled task, not from a React render
 * function, `useLayoutEffect` or `useEffect`. React cannot flush a nested root
 * there; `mount` and `update` then throw `ZEUS_RENDERER_ADAPTER_FAILURE`.
 */
export function createReactRenderer<Data, Context = undefined>(
  render: ReactRenderFunction<Data, Context>,
  options: ReactRendererOptions = {},
): RendererAdapter<Element, Data, Context, ReactRendererHandle> {
  const roots = new WeakMap<ReactRendererHandle, MountedRoot>()
  const disposed = new WeakSet<ReactRendererHandle>()

  function capture(
    mounted: MountedRoot,
    run: () => void,
  ): { error: unknown } | undefined {
    mounted.capturing = true
    mounted.failure = undefined
    try {
      run()
    } catch (error) {
      // React 18 rethrows render errors from flushSync.
      mounted.failure ??= { error }
    } finally {
      mounted.capturing = false
    }
    const failure = mounted.failure
    mounted.failure = undefined
    return failure
  }

  function commit(mounted: MountedRoot, data: Data, context: Context): void {
    const revision = ++mounted.revision
    const key = String(mounted.session.key)
    const failure = capture(mounted, () => {
      const node = render(data, context, mounted.session)
      const probe = createElement(RenderProbe, { mounted, revision })
      flushSync(() => {
        mounted.root.render(
          createElement(
            options.strict ? StrictMode : Fragment,
            null,
            probe,
            node,
          ),
        )
      })
    })
    if (failure) {
      throw rendererError(
        'ZEUS_RENDERER_ADAPTER_FAILURE',
        `React renderer failed for key ${key}.`,
        failure.error,
      )
    }
    if (mounted.rendered !== revision) {
      throw rendererError(
        'ZEUS_RENDERER_ADAPTER_FAILURE',
        `React renderer could not commit key ${key} synchronously. Call mount and update outside React rendering and commits.`,
      )
    }
  }

  function report(mounted: MountedRoot, error: unknown): void {
    if (options.onError) {
      options.onError(error, mounted.session)
      return
    }
    const reportError = (
      globalThis as { reportError?: (error: unknown) => void }
    ).reportError
    if (typeof reportError === 'function') reportError(error)
    else console.error(error)
  }

  function lookup(handle: ReactRendererHandle, phase: string): MountedRoot {
    const mounted = roots.get(handle)
    if (mounted && mounted.container === handle.container) return mounted
    if (disposed.has(handle)) {
      throw rendererError(
        'ZEUS_RENDERER_DISPOSED',
        `Cannot ${phase} a React renderer handle after it was disposed.`,
      )
    }
    throw rendererError(
      'ZEUS_RENDERER_CONTAINER_MISMATCH',
      `Cannot ${phase} a handle that this React renderer did not mount.`,
    )
  }

  return {
    mount(container, data, context, session) {
      const mounted: MountedRoot = {
        container,
        session,
        revision: 0,
        rendered: 0,
        capturing: false,
        failure: undefined,
        root: undefined as unknown as Root,
      }
      mounted.root = createRoot(container, {
        identifierPrefix: options.identifierPrefix,
        // React 19 reports uncaught errors here instead of throwing.
        onUncaughtError(error: unknown) {
          if (mounted.capturing) mounted.failure ??= { error }
          else report(mounted, error)
        },
      } as Parameters<typeof createRoot>[1])
      try {
        commit(mounted, data, context)
      } catch (error) {
        // The original failure is what the host needs; cleanup errors from
        // the half-mounted root are not reported separately.
        capture(mounted, () => mounted.root.unmount())
        throw error
      }
      const handle = { container, state: 'mounted' as const }
      roots.set(handle, mounted)
      return handle
    },

    update(handle, data, context) {
      commit(lookup(handle, 'update'), data, context)
    },

    dispose(handle) {
      if (disposed.has(handle)) return
      const mounted = lookup(handle, 'dispose')
      roots.delete(handle)
      disposed.add(handle)
      ;(handle as { state: ReactRendererHandle['state'] }).state = 'disposed'
      // The root is unmounted even when a cleanup throws, so the handle stays
      // disposed and a retried dispose does not unmount it again.
      const failure = capture(mounted, () => mounted.root.unmount())
      if (failure) {
        throw rendererError(
          'ZEUS_RENDERER_ADAPTER_FAILURE',
          `React renderer dispose failed for key ${String(mounted.session.key)}.`,
          failure.error,
        )
      }
    },
  }
}

// Mirrors `createRendererError` without a runtime import, so this entry only
// depends on @zeus-js/web-c-runtime for types.
function rendererError(
  code: RendererErrorCode,
  message: string,
  cause?: unknown,
): Error {
  const error = new Error(`[${code}] ${message}`) as Error & { cause?: unknown }
  if (cause !== undefined) error.cause = cause
  return error
}
