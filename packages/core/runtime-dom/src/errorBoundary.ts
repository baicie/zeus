import { getCurrentScope, onScopeDispose } from '@zeus-js/signal/internal'

import { captureScopedSubtreeContext, ScopedSubtree } from './scopedSubtree'

import type { JSXValue } from './types'

export interface ErrorBoundaryProps {
  /** The child must be a factory so setup errors stay inside the boundary. */
  children: () => JSXValue
  fallback: (error: unknown, reset: () => void) => JSXValue
  onError?: (error: unknown) => void
}

/**
 * Mounts an explicit-factory error boundary without introducing a wrapper node.
 * Compiler lowering may target this helper once boundary children are emitted
 * as factories automatically.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): DocumentFragment {
  if (getCurrentScope() === undefined) {
    throw new Error(
      'ZEUS_ERROR_BOUNDARY_SCOPE_REQUIRED: ErrorBoundary must be rendered inside a scope.',
    )
  }

  assertProps(props)

  const source = document.createDocumentFragment()
  const start = document.createComment('zeus-error-boundary-start')
  const end = document.createComment('zeus-error-boundary-end')
  source.append(start, end)

  const subtree = new ScopedSubtree(source, end, captureScopedSubtreeContext())
  let failed = false
  let disposed = false

  const reset = (): void => {
    if (disposed || !failed) return
    failed = false
    renderChild()
  }

  function renderChild(): void {
    try {
      subtree.replace(props.children)
      failed = false
    } catch (error) {
      failed = true
      props.onError?.(error)
      // A fallback error is intentionally allowed to escape to the caller.
      subtree.replace(() => props.fallback(error, reset))
    }
  }

  renderChild()

  onScopeDispose(() => {
    if (disposed) return
    disposed = true
    subtree.dispose()
  }, true)

  return source
}

function assertProps(props: ErrorBoundaryProps): void {
  if (!props || typeof props.children !== 'function') {
    throw new TypeError(
      'ZEUS_ERROR_BOUNDARY_CHILDREN_REQUIRED: children must be a render factory.',
    )
  }
  if (typeof props.fallback !== 'function') {
    throw new TypeError(
      'ZEUS_ERROR_BOUNDARY_FALLBACK_REQUIRED: fallback must be a render factory.',
    )
  }
}
