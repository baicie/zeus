// packages/runtime-dom/src/insert.ts

import { effect, onScopeDispose, stop } from '@zeus-js/signal'

import { getCurrentOwner, runWithOwner } from './context'
import { captureCurrentHostContext, withHostContext } from './hostContext'
import { DynamicRange, insertTracked } from './range'

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
  const range = new DynamicRange(parent, marker)
  const hostContext = captureCurrentHostContext()
  const owner = getCurrentOwner()

  const runner = effect(() => {
    const next = runWithOwner(owner, () => withHostContext(hostContext, value))
    range.replace(next)
  })

  onScopeDispose(() => {
    stop(runner)
    range.clear()
  }, true)
}
