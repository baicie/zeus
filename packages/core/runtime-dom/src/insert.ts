// packages/runtime-dom/src/insert.ts

import { onScopeDispose } from '@zeus-js/signal/internal'

import { bindEffect } from './bindings'
import { insertTracked } from './range'
import { captureScopedSubtreeContext, ScopedSubtree } from './scopedSubtree'

import type { JSXValue } from './types'

export { insertTracked }

export function insert(
  parent: Node,
  value: JSXValue,
  marker: Node | null = null,
): void {
  if (value === undefined) {
    if (__DEV__) {
      console.warn(
        '[Zeus runtime] insert received `undefined`, which is ignored. ' +
          'Use `null` or a fallback value explicitly if you want to suppress this warning.',
      )
    }

    return
  }

  insertTracked(parent, value, marker)
}

export function mountDynamic(
  parent: Node,
  marker: Node,
  value: () => JSXValue,
): void {
  const subtree = new ScopedSubtree(
    parent,
    marker,
    captureScopedSubtreeContext(),
  )

  const metadata = {
    kind: 'dynamic-region',
    target: parent,
  }

  bindEffect(
    () => {
      subtree.replace(value)
      metadata.target = dynamicBindingTarget(subtree.current(), parent)
    },
    false,
    () => {},
    metadata,
  )

  onScopeDispose(() => {
    subtree.dispose()
  }, true)
}

function dynamicBindingTarget(nodes: readonly Node[], fallback: Node): Node {
  const first = nodes[0]
  if (!first) return fallback
  if (first.nodeType === 3 && first.parentNode) return first.parentNode
  return first
}
