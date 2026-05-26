import { getCurrentScope, onScopeDispose } from '@zeus-js/signal'

import type { RefTarget } from './types'

export function setRef<T>(
  target: RefTarget<T> | null | undefined,
  value: T | null,
): void {
  if (target == null) return

  if (typeof target === 'function') {
    target(value)
    return
  }

  if ('value' in target) {
    target.value = value
    return
  }

  if ('current' in target) {
    target.current = value
    return
  }

  if (__DEV__) {
    console.warn('[Zeus runtime] Invalid ref target:', target)
  }
}

export function bindRef<T extends Element>(
  el: T,
  target: RefTarget<T> | null | undefined,
): void {
  setRef(target, el)

  if (getCurrentScope()) {
    onScopeDispose(() => {
      setRef(target, null)
    }, true)
  }
}
