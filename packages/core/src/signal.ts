import alienSignals from 'alien-signals'
import { trackRead, triggerWrite } from './graph'

export type Accessor<T> = () => T
export type Setter<T> = (value: T | ((prev: T) => T)) => T

export interface Signal<T> {
  get: Accessor<T>
  set: Setter<T>
}

export function createSignal<T>(
  initial: T,
): [Accessor<T>, Setter<T>] {
  const node = alienSignals.createSignal(initial)

  const get = () => {
    trackRead(node)
    return node.value
  }

  const set = (next: T | ((prev: T) => T)) => {
    const value =
      typeof next === 'function' ? (next as (p: T) => T)(node.value) : next

    if (Object.is(value, node.value)) return node.value
    node.value = value
    triggerWrite(node)
    return node.value
  }

  return [get, set]
}
