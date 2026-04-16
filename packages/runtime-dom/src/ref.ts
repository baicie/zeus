import { createEffect } from '@zeusjs/core'

export function bindProp<T extends Element, K extends keyof T>(
  el: T,
  key: K,
  expr: () => T[K],
): void {
  createEffect(() => {
    ;(el as any)[key] = expr()
  })
}

export function setProp<T extends Element, K extends keyof T>(
  el: T,
  key: K,
  value: T[K],
): void {
  ;(el as any)[key] = value
}
