import { scope } from '@zeus-js/signal/internal'

import {
  beginHydrationSession,
  endHydrationSession,
  hasHydrationMarkers,
  reportHydrationFailure,
  suspendHydrationSession,
} from './autoHydration'
import { createOwner, disposeOwner, runWithOwner } from './context'
import { emitDevtoolsEvent, getDevtoolsObjectId } from './devtools'
import { insert } from './insert'

import type { JSXValue } from './types'

export interface RenderOptions {
  owner?: ReturnType<typeof createOwner>
  /**
   * Adopts compiler-planned server markup already inside `container` instead
   * of clearing it. Throws `ZEUS_HYDRATION_NO_MARKUP` when the container has
   * no hydration markers and the render produced client nodes.
   */
  hydrate?: boolean
  /** Receives every scoped `ZEUS_HYDRATION_*` diagnostic of this takeover. */
  onHydrationError?: (error: Error) => void
}

/**
 * Returned by `renderWithPreservedNodes` only. `active` is an internal
 * custom-element contract — a disposed render scope must not be reused as a
 * cached mount — so the public `render()` signature stays `() => void`.
 */
interface RenderDisposer {
  (): void
  readonly active: boolean
}

/** Internal mount options for runtime callers such as custom elements. */
interface MountOptions extends RenderOptions {
  /** Internal: keeps the container's existing nodes during the initial mount. */
  readonly keepMarkup?: boolean
  /**
   * Hands `owner` over to this render, which then releases it on dispose or
   * setup failure. Only the code that created the owner may set this.
   */
  readonly ownsOwner?: boolean
  /**
   * Nodes the render owns but must not clear: they are mounted before the
   * value and kept in place, yet removed on dispose because the render created
   * them. Custom elements use this for injected `<style>` elements, which are
   * framework-owned even though consumer children next to them are not.
   */
  readonly ownedNodes?: readonly Node[]
}

export function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options: RenderOptions = {},
): () => void {
  if (options.hydrate) {
    return hydrateRender(value, container, options)
  }
  return renderWithPreservedNodes(value, container, { owner: options.owner })
}

/**
 * `render(..., { hydrate: true })`: the container keeps its server markup, a
 * session lets every compiled component adopt its own nodes, and a failure
 * that left the server tree unusable falls back to one client render.
 */
function hydrateRender(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options: RenderOptions,
): () => void {
  if (!hasHydrationMarkers(container)) {
    // Nothing to adopt: behave exactly like a client render. `hydrate` is a
    // mode request, not a promise that server markup exists.
    return renderWithPreservedNodes(value, container, { owner: options.owner })
  }

  let adoptionError: Error | undefined
  const session = beginHydrationSession(container, {
    onHydrationError: error => {
      adoptionError ??= error
      options.onHydrationError?.(error)
    },
    primary: true,
  })

  let dispose: (() => void) | undefined
  try {
    dispose = renderWithPreservedNodes(value, container, {
      owner: options.owner,
      keepMarkup: true,
    })
  } catch (error) {
    endHydrationSession(session)
    throw error
  }

  if (!session.adopted) {
    // No compiled component adopted a server root. The client tree (if any)
    // sits next to the server markup, which is a duplicate: report the failure
    // and replace the container with one ordinary client render.
    endHydrationSession(session)
    try {
      dispose()
    } catch {
      /* The fallback render is the actionable result. */
    }
    reportHydrationFailure(
      container,
      adoptionError ??
        new Error(
          'ZEUS_HYDRATION_NO_ADOPTION: no compiled component adopted the server markup',
        ),
      options.onHydrationError,
    )
    return renderWithPreservedNodes(value, container, { owner: options.owner })
  }

  suspendHydrationSession(session)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    try {
      dispose()
    } finally {
      endHydrationSession(session)
    }
  }
}

export function renderWithPreservedNodes(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options: MountOptions = {},
  preserveNodes: readonly Node[] = [],
): RenderDisposer {
  const renderScope = scope()
  // A caller-provided owner may be shared by other renders, so it belongs to
  // this render's lifetime only when the caller explicitly hands it over.
  const owner = options.owner ?? createOwner()
  const ownedOwner = !options.owner || options.ownsOwner ? owner : undefined
  const ownedNodes = options.ownedNodes ?? []
  const initialPreserveNodes = options.keepMarkup
    ? Array.from(container.childNodes)
    : preserveNodes
  // Both lists survive the initial clear: consumer nodes stay for the whole
  // mount, framework-owned nodes are removed on dispose.
  const keptOnMount =
    ownedNodes.length === 0
      ? initialPreserveNodes
      : [...initialPreserveNodes, ...ownedNodes]
  const releaseNodes = (): void => {
    for (const node of ownedNodes) node.parentNode?.removeChild(node)
  }

  const releaseOwnedOwner = (): void => {
    if (!ownedOwner) return
    try {
      disposeOwner(ownedOwner)
    } finally {
      if (typeof window !== 'undefined' && window.__ZEUS_DEVTOOLS_HOOK__) {
        emitDevtoolsEvent(
          {
            type: 'owner:dispose',
            ownerId: getDevtoolsObjectId(ownedOwner),
            target: container,
          },
          { swallowErrors: true },
        )
      }
    }
  }

  try {
    renderScope.run(() => {
      clearContainer(container, keptOnMount)

      runWithOwner(owner, () => {
        insert(container, resolveValue(value))
      })
    })
  } catch (error) {
    // Setup failed after bindings or cleanups may already be registered.
    // Release them so nothing keeps updating a render the caller never got a
    // disposer for. The setup error is the actionable one.
    try {
      renderScope.stop()
    } catch {
      /* Preserve the initial render setup failure. */
    }
    try {
      clearContainer(container, preserveNodes)
      releaseNodes()
    } catch {
      /* Preserve the initial render setup failure. */
    }
    try {
      releaseOwnedOwner()
    } catch {
      /* Preserve the initial render setup failure. */
    }
    throw error
  }

  emitDevtoolsEvent({ type: 'render', target: container })

  let disposed = false

  const dispose = () => {
    if (disposed) return
    disposed = true

    let failed = false
    let firstError: unknown

    try {
      renderScope.stop()
    } catch (error) {
      failed = true
      firstError = error
    }

    try {
      // Scope cleanup is allowed to throw, but it must not leave the DOM
      // subtree mounted. Keep disposal idempotent while preserving the first
      // cleanup error for the caller.
      clearContainer(container, preserveNodes)
      releaseNodes()
    } catch (error) {
      if (!failed) {
        failed = true
        firstError = error
      }
    }

    try {
      releaseOwnedOwner()
    } catch (error) {
      if (!failed) {
        failed = true
        firstError = error
      }
    }

    if (failed) throw firstError
  }

  return Object.defineProperty(dispose, 'active', {
    get: () => renderScope.active,
  }) as RenderDisposer
}

function clearContainer(
  container: Element | DocumentFragment,
  preserveNodes: readonly Node[] = [],
): void {
  if (preserveNodes.length === 0) {
    container.textContent = ''
    return
  }

  const preserved = new Set(preserveNodes)

  for (const child of Array.from(container.childNodes)) {
    if (!preserved.has(child)) container.removeChild(child)
  }
}

function resolveValue(value: JSXValue | (() => JSXValue)): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
