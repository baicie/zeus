import { getCurrentEffect, onEffectCleanup } from './effect'
import { getCurrentScope, onScopeDispose } from './effectScope'
import { warn } from './warning'

export function onCleanup(fn: () => void): void {
  const effect = getCurrentEffect()
  const scope = getCurrentScope()

  if (scope && effect?.scope !== scope) {
    onScopeDispose(fn, true)
    return
  }

  if (effect) {
    onEffectCleanup(fn, true)
    return
  }

  if (scope) {
    onScopeDispose(fn, true)
    return
  }

  if (__DEV__) {
    warn('onCleanup() was called without active effect or scope.')
  }
}
