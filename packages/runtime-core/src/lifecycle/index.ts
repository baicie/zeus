// packages/runtime-core/src/lifecycle/index.ts

export function onMounted(callback: () => void): void {
  // 实现生命周期钩子
}

export function onUpdated(callback: () => void): void {
  // 实现生命周期钩子
}

export function onUnmounted(callback: () => void): void {
  // 实现生命周期钩子
}

export function onBeforeMount(callback: () => void): void {
  // 实现生命周期钩子
}

export function onBeforeUpdate(callback: () => void): void {
  // 实现生命周期钩子
}

export function onBeforeUnmount(callback: () => void): void {
  // 实现生命周期钩子
}

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
