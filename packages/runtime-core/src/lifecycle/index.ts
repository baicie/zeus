// packages/runtime-core/src/lifecycle/index.ts

import { effect } from '@zeus-js/signal'

export interface LifecycleHooks {
  mounted: (() => void)[]
  updated: (() => void)[]
  unmounted: (() => void)[]
  beforeMount: (() => void)[]
  beforeUpdate: (() => void)[]
  beforeUnmount: (() => void)[]
}

export function createLifecycleHooks(): LifecycleHooks {
  return {
    mounted: [],
    updated: [],
    unmounted: [],
    beforeMount: [],
    beforeUpdate: [],
    beforeUnmount: [],
  }
}

// 全局生命周期钩子存储
const currentLifecycleHooks = new WeakMap<object, LifecycleHooks>()

export function setCurrentLifecycleHooks(
  instance: object,
  hooks: LifecycleHooks,
): void {
  currentLifecycleHooks.set(instance, hooks)
}

export function getCurrentLifecycleHooks(
  instance: object,
): LifecycleHooks | undefined {
  return currentLifecycleHooks.get(instance)
}

export function onMounted(callback: () => void): void {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    const hooks =
      getCurrentLifecycleHooks(currentInstance) || createLifecycleHooks()
    hooks.mounted.push(callback)
    setCurrentLifecycleHooks(currentInstance, hooks)
  }
}

export function onUpdated(callback: () => void): void {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    const hooks =
      getCurrentLifecycleHooks(currentInstance) || createLifecycleHooks()
    hooks.updated.push(callback)
    setCurrentLifecycleHooks(currentInstance, hooks)
  }
}

export function onUnmounted(callback: () => void): void {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    const hooks =
      getCurrentLifecycleHooks(currentInstance) || createLifecycleHooks()
    hooks.unmounted.push(callback)
    setCurrentLifecycleHooks(currentInstance, hooks)
  }
}

export function onBeforeMount(callback: () => void): void {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    const hooks =
      getCurrentLifecycleHooks(currentInstance) || createLifecycleHooks()
    hooks.beforeMount.push(callback)
    setCurrentLifecycleHooks(currentInstance, hooks)
  }
}

export function onBeforeUpdate(callback: () => void): void {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    const hooks =
      getCurrentLifecycleHooks(currentInstance) || createLifecycleHooks()
    hooks.beforeUpdate.push(callback)
    setCurrentLifecycleHooks(currentInstance, hooks)
  }
}

export function onBeforeUnmount(callback: () => void): void {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    const hooks =
      getCurrentLifecycleHooks(currentInstance) || createLifecycleHooks()
    hooks.beforeUnmount.push(callback)
    setCurrentLifecycleHooks(currentInstance, hooks)
  }
}

// 实例管理
let currentInstance: object | null = null
const instanceStack: object[] = []

export function setCurrentInstance(instance: object | null): void {
  currentInstance = instance
  if (instance) {
    instanceStack.push(instance)
  } else {
    instanceStack.pop()
  }
}

export function getCurrentInstance(): object | null {
  return currentInstance
}

export function pushCurrentInstance(instance: object): void {
  instanceStack.push(instance)
  currentInstance = instance
}

export function popCurrentInstance(): void {
  instanceStack.pop()
  currentInstance = instanceStack[instanceStack.length - 1] || null
}

// 执行生命周期钩子
export function invokeLifecycleHooks(
  instance: object,
  hookType: keyof LifecycleHooks,
): void {
  const hooks = getCurrentLifecycleHooks(instance)
  if (hooks && hooks[hookType]) {
    hooks[hookType].forEach(callback => callback())
  }
}

// 监听更新
export function watchEffect(callback: () => void): () => void {
  return effect(callback)
}
