import { getCurrentEffect, onEffectCleanup } from './effect'
import { getCurrentScope, onScopeDispose } from './effectScope'
import { warn } from './warning'

export function onCleanup(fn: () => void): void {
  if (getCurrentEffect()) {
    onEffectCleanup(fn, true)
    return
  }

  if (getCurrentScope()) {
    onScopeDispose(fn, true)
    return
  }

  if (__DEV__) {
    warn('onCleanup() was called without active effect or scope.')
  }
}
