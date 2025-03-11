import { isObject } from '@zeus/shared'

export interface Signal<T> {
  (): T
  set: (value: T) => void
}

export interface Computed<T> {
  (): T
}

export function createSignal<T>(value: T): Signal<T> {
  let currentValue = value
  const subscribers = new Set<() => void>()

  const signal = () => {
    // 编译时会被优化掉
    return currentValue
  }

  signal.set = (newValue: T) => {
    if (currentValue !== newValue) {
      currentValue = newValue
      subscribers.forEach(fn => fn())
    }
  }

  return signal
}

export function createMemo<T>(fn: () => T): Computed<T> {
  let value: T
  let dirty = true

  return () => {
    if (dirty) {
      value = fn()
      dirty = false
    }
    return value
  }
}

export function createEffect(fn: () => void): void {
  fn()
}
