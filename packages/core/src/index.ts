export type Accessor<T> = () => T
export type Setter<T> = (value: T | ((prev: T) => T)) => T
export type CleanupFn = () => void

export interface Owner {
  parent: Owner | null
  cleanups: CleanupFn[] | null
  children: Owner[] | null
  disposed: boolean
}

export interface Signal<T> {
  get: Accessor<T>
  set: Setter<T>
}

export { createSignal } from './signal'
export { createMemo } from './memo'
export { createEffect } from './effect'
export { createRoot } from './root'
export { onCleanup, disposeOwner } from './cleanup'
export { batch } from './batch'
export { getOwner, runWithOwner, createOwner } from './owner'

export { trackRead, trackWrite, triggerWrite } from './graph'
