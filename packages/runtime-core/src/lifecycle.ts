import { queuePostFlushCb } from './scheduler'

export type LifecycleHook = () => void

interface LifecycleHooks {
  onMount: LifecycleHook[]
  onUnmount: LifecycleHook[]
  onCleanup: LifecycleHook[]
}

interface Lifecycle {
  hooks: LifecycleHooks | null
}

let currentLifecycle: Lifecycle | null = null

export function setCurrentLifecycle(lifecycle: Lifecycle | null): void {
  currentLifecycle = lifecycle
}

export function getCurrentLifecycle(): Lifecycle | null {
  return currentLifecycle
}

export function createLifecycle(): Lifecycle {
  return {
    hooks: {
      onMount: [],
      onUnmount: [],
      onCleanup: [],
    },
  }
}

export function onMount(callback: LifecycleHook): void {
  if (currentLifecycle && currentLifecycle.hooks) {
    currentLifecycle.hooks.onMount.push(callback)
  }
}

export function onUnmount(callback: LifecycleHook): void {
  if (currentLifecycle && currentLifecycle.hooks) {
    currentLifecycle.hooks.onUnmount.push(callback)
  }
}

export function onCleanup(callback: LifecycleHook): void {
  if (currentLifecycle && currentLifecycle.hooks) {
    currentLifecycle.hooks.onCleanup.push(callback)
  }
}

export function invokeArrayFns(fns: LifecycleHook[]): void {
  for (let i = 0; i < fns.length; i++) {
    fns[i]()
  }
}

export function invokeMountHook(lifecycle: Lifecycle): void {
  if (lifecycle.hooks && lifecycle.hooks.onMount.length) {
    queuePostFlushCb(function () {
      invokeArrayFns(lifecycle.hooks!.onMount)
    })
  }
}

export function invokeUnmountHook(lifecycle: Lifecycle): void {
  if (lifecycle.hooks) {
    invokeArrayFns(lifecycle.hooks.onUnmount)
  }
}

export function invokeCleanupHook(lifecycle: Lifecycle): void {
  if (lifecycle.hooks && lifecycle.hooks.onCleanup.length) {
    invokeArrayFns(lifecycle.hooks.onCleanup)
  }
}

export function hasLifecycleHooks(lifecycle: Lifecycle): boolean {
  if (!lifecycle.hooks) {
    return false
  }
  return (
    lifecycle.hooks.onMount.length > 0 ||
    lifecycle.hooks.onUnmount.length > 0 ||
    lifecycle.hooks.onCleanup.length > 0
  )
}
