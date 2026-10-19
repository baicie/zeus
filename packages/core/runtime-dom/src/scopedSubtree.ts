import { effectScope, getCurrentScope } from '@zeus-js/signal/internal'

import { getCurrentOwner, runWithOwner } from './context'
import {
  getCurrentErrorBoundaryHandler,
  getScopeErrorBoundaryHandler,
  setScopeErrorBoundaryHandler,
} from './errorBoundaryContext'
import { captureCurrentHostContext, withHostContext } from './hostContext'
import { insertTracked, moveRangeBefore, removeNodes } from './range'

import type { Owner } from './context'
import type { ErrorBoundaryHandler } from './errorBoundaryContext'
import type { HostRenderContext } from './hostContext'
import type { JSXValue } from './types'
import type { EffectScope } from '@zeus-js/signal/internal'

export interface ScopedSubtreeContext {
  owner: Owner | undefined
  host: HostRenderContext | undefined
}

export function captureScopedSubtreeContext(): ScopedSubtreeContext {
  return {
    owner: getCurrentOwner(),
    host: captureCurrentHostContext(),
  }
}

export class ScopedSubtree {
  private nodes: Node[] = []
  private scope: EffectScope | undefined

  constructor(
    private readonly parent: Node,
    private readonly marker: Node | null,
    private readonly context: ScopedSubtreeContext,
  ) {}

  replace(
    render: () => JSXValue,
    errorHandler?: ErrorBoundaryHandler | null,
  ): void {
    const resolvedErrorHandler =
      errorHandler === undefined
        ? (getCurrentErrorBoundaryHandler() ??
          getScopeErrorBoundaryHandler(getCurrentScope()))
        : errorHandler
    this.dispose()

    const scope = effectScope(true)
    const parent = this.resolveParent(this.marker)
    let nodes: Node[] = []

    try {
      scope.run(() => {
        nodes = runWithOwner(this.context.owner, () =>
          withHostContext(this.context.host, () =>
            insertTracked(parent, render(), this.marker),
          ),
        )
      })
    } catch (error) {
      // The render failure is the actionable boundary error. Cleanup still
      // runs, but must not replace it when a cleanup callback also throws.
      try {
        scope.stop()
      } catch {
        // Preserve the original render error for ErrorBoundary/render().
      }
      try {
        removeNodes(nodes)
      } catch {
        // Preserve the original render error for ErrorBoundary/render().
      }
      throw error
    }

    this.scope = scope
    setScopeErrorBoundaryHandler(scope, resolvedErrorHandler ?? undefined)
    this.nodes = nodes
  }

  setErrorHandler(handler: ((error: unknown) => void) | undefined): void {
    setScopeErrorBoundaryHandler(this.scope, handler)
  }

  dispose(): void {
    if (this.scope) {
      setScopeErrorBoundaryHandler(this.scope, undefined)
      this.scope.stop()
    }
    this.scope = undefined
    removeNodes(this.nodes)
    this.nodes = []
  }

  moveBefore(marker: Node | null): void {
    moveRangeBefore(this.nodes, this.resolveParent(marker), marker)
  }

  current(): readonly Node[] {
    return this.nodes
  }

  private resolveParent(marker: Node | null): Node {
    return marker?.parentNode ?? this.marker?.parentNode ?? this.parent
  }
}
