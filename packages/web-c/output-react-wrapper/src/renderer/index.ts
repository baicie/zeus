// React Framework Renderer Adapter (RFC-011). ReactNode, Hooks, Context and
// Portals are interpreted only here; the Web Component runtime and the
// renderer host only see the container and the opaque handle.
import { StrictMode, createElement } from 'react'
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
  failure: { error: unknown } | undefined
}

/**
 * Creates an adapter that renders `render(data, context, session)` into a
 * dedicated React root per container. Mount and update commit synchronously
 * (`flushSync`), so the host sees the rendered DOM when the call returns; do
 * not call them while React itself is rendering.
 */
export function createReactRenderer<Data, Context = undefined>(
  render: ReactRenderFunction<Data, Context>,
  options: ReactRendererOptions = {},
): RendererAdapter<Element, Data, Context, ReactRendererHandle> {
  const roots = new WeakMap<ReactRendererHandle, MountedRoot>()
  const disposed = new WeakSet<ReactRendererHandle>()

  function commit(mounted: MountedRoot, data: Data, context: Context): void {
    mounted.failure = undefined
    try {
      const node = render(data, context, mounted.session)
      flushSync(() => {
        mounted.root.render(
          options.strict ? createElement(StrictMode, null, node) : node,
        )
      })
    } catch (error) {
      // React 18 rethrows render errors from flushSync.
      mounted.failure ??= { error }
    }
    if (mounted.failure) {
      throw rendererError(
        'ZEUS_RENDERER_ADAPTER_FAILURE',
        `React renderer failed for key ${String(mounted.session.key)}.`,
        mounted.failure.error,
      )
    }
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
        failure: undefined,
        root: undefined as unknown as Root,
      }
      mounted.root = createRoot(container, {
        identifierPrefix: options.identifierPrefix,
        // React 19 reports uncaught render errors here instead of throwing.
        onUncaughtError(error: unknown) {
          mounted.failure ??= { error }
        },
      } as Parameters<typeof createRoot>[1])
      try {
        commit(mounted, data, context)
      } catch (error) {
        mounted.root.unmount()
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
      mounted.root.unmount()
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
