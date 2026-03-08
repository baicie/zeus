import { effect } from '@zeus-js/signal'

export interface LifecycleHooks {
  onMount: (() => void)[]
  onUpdate: (() => void)[]
  onUnmount: (() => void)[]
  onBeforeMount: (() => void)[]
  onBeforeUpdate: (() => void)[]
  onBeforeUnmount: (() => void)[]
}

const lifecycleStack: LifecycleHooks[] = []
let currentLifecycle: LifecycleHooks | null = null

export function createLifecycleScope(): LifecycleHooks {
  return {
    onMount: [],
    onUpdate: [],
    onUnmount: [],
    onBeforeMount: [],
    onBeforeUpdate: [],
    onBeforeUnmount: [],
  }
}

export function enterLifecycleScope(): void {
  const scope = createLifecycleScope()
  lifecycleStack.push(scope)
  currentLifecycle = scope
}

export function onMounted(callback: () => void): void {
  if (currentLifecycle) {
    currentLifecycle.onMount.push(callback)
  }
}

export function onUpdated(callback: () => void): void {
  if (currentLifecycle) {
    currentLifecycle.onUpdate.push(callback)
  }
}

export function onUnmounted(callback: () => void): void {
  if (currentLifecycle) {
    currentLifecycle.onUnmount.push(callback)
  }
}

export function onBeforeMount(callback: () => void): void {
  if (currentLifecycle) {
    currentLifecycle.onBeforeMount.push(callback)
  }
}

export function onBeforeUpdate(callback: () => void): void {
  if (currentLifecycle) {
    currentLifecycle.onBeforeUpdate.push(callback)
  }
}

export function onBeforeUnmount(callback: () => void): void {
  if (currentLifecycle) {
    currentLifecycle.onBeforeUnmount.push(callback)
  }
}

export function watchEffect(callback: () => void): () => void {
  return effect(callback)
}

export function withLifecycle<T extends any[], R>(
  setupFn: (...args: T) => R,
): (...args: T) => R {
  return (...args: T) => {
    enterLifecycleScope()
    try {
      const result = setupFn(...args)
      return result
    } finally {
      // 生命周期钩子会在组件渲染时被调用
    }
  }
}
