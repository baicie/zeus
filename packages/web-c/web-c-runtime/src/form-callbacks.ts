import type { HostRef, ZeusFormCallback } from './types'

export function invokeFormCallback(
  hostRef: HostRef,
  callback: ZeusFormCallback,
): void {
  switch (callback.type) {
    case 'associated':
      hostRef.instance?.formAssociated?.(callback.form)
      return
    case 'disabled':
      hostRef.instance?.formDisabled?.(callback.disabled)
      return
    case 'reset':
      hostRef.instance?.formReset?.()
      return
    case 'stateRestore':
      hostRef.instance?.formStateRestore?.(callback.state, callback.mode)
  }
}
