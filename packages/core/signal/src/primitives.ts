import { computed } from './computed'
import { batch as runBatch, effect } from './effect'
import { effectScope } from './effectScope'
import { onCleanup } from './lifecycle'
import { shallowRef } from './ref'

export type Accessor<T> = () => T
export type Setter<T> = (value: T | ((previous: T) => T)) => T

export function createSignal<T>(initialValue: T): [Accessor<T>, Setter<T>] {
  const source = shallowRef(initialValue)

  const read: Accessor<T> = () => source.value
  const write: Setter<T> = value => {
    const next =
      typeof value === 'function'
        ? (value as (previous: T) => T)(source.value)
        : value

    source.value = next
    return next
  }

  return [read, write]
}

export function createMemo<T>(compute: () => T): Accessor<T> {
  const memo = computed(compute)
  return () => memo.value
}

export function createEffect(run: () => void): void {
  effect(run)
}

export function createRoot<T>(run: (dispose: () => void) => T): T {
  const root = effectScope(true)
  let disposed = false

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    root.stop()
  }

  try {
    return root.run(() => run(dispose)) as T
  } catch (error) {
    dispose()
    throw error
  }
}

export { onCleanup }
export { runBatch as batch }
