// packages/runtime-dom/src/insert.ts

import { effect, onScopeDispose, stop } from '@zeus-js/signal/internal'

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

  const runner = effect(() => {
    subtree.replace(value)
  })

  onScopeDispose(() => {
    stop(runner)
    subtree.dispose()
  }, true)
}
