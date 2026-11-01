import { scope } from '@zeus-js/signal/internal'

import { createOwner, disposeOwner, runWithOwner } from './context'
import { emitDevtoolsEvent, getDevtoolsObjectId } from './devtools'
import { insert } from './insert'

import type { JSXValue } from './types'

export interface RenderOptions {
  owner?: ReturnType<typeof createOwner>
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
  /**
   * Hands `owner` over to this render, which then releases it on dispose or
   * setup failure. Only the code that created the owner may set this.
   */
  readonly ownsOwner?: boolean
}

export function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options: RenderOptions = {},
): () => void {
  return renderWithPreservedNodes(value, container, { owner: options.owner })
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
      clearContainer(container, preserveNodes)

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
