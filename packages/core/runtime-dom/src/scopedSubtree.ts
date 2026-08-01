import { effectScope } from '@zeus-js/signal'

import { getCurrentOwner, runWithOwner } from './context'
import { captureCurrentHostContext, withHostContext } from './hostContext'
import { insertTracked, moveRangeBefore, removeNodes } from './range'

import type { Owner } from './context'
import type { HostRenderContext } from './hostContext'
import type { JSXValue } from './types'
import type { EffectScope } from '@zeus-js/signal'

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

  replace(render: () => JSXValue): void {
    this.dispose()

    const scope = effectScope(true)
    let nodes: Node[] = []

    try {
      scope.run(() => {
        nodes = runWithOwner(this.context.owner, () =>
          withHostContext(this.context.host, () =>
            insertTracked(this.parent, render(), this.marker),
          ),
        )
      })
    } catch (error) {
      scope.stop()
      removeNodes(nodes)
      throw error
    }

    this.scope = scope
    this.nodes = nodes
  }

  dispose(): void {
    this.scope?.stop()
    this.scope = undefined
    removeNodes(this.nodes)
    this.nodes = []
  }

  moveBefore(marker: Node | null): void {
    moveRangeBefore(this.nodes, this.parent, marker)
  }

  current(): readonly Node[] {
    return this.nodes
  }
}
