import { effect, onScopeDispose, stop } from '@zeus-js/signal'

import { removeNodes } from './dom'
import { captureCurrentHostContext, withHostContext } from './hostContext'

import type { JSXValue } from './types'

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

  if (value == null || value === false || value === true) return

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      insert(parent, value[i], marker)
    }
    return
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  parent.insertBefore(node, marker)
}

export function mountDynamic(
  parent: Node,
  marker: Node,
  value: () => JSXValue,
): void {
  let current: Node[] = []
  const hostContext = captureCurrentHostContext()

  const runner = effect(() => {
    removeNodes(current)

    const next = withHostContext(hostContext, value)

    current = insertTracked(parent, next, marker)
  })

  onScopeDispose(() => {
    stop(runner)
    removeNodes(current)
    current = []
  }, true)
}

function insertTracked(
  parent: Node,
  value: JSXValue,
  marker: Node | null,
): Node[] {
  if (
    value === undefined ||
    value == null ||
    value === false ||
    value === true
  ) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => insertTracked(parent, item, marker))
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  parent.insertBefore(node, marker)

  return [node]
}
