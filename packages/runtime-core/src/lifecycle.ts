import { queuePostFlushCb } from './scheduler'

export type LifecycleHook = () => void

interface LifecycleHooks {
  onMount: LifecycleHook[]
  onCleanup: LifecycleHook[]
}

interface Lifecycle {
  hooks: LifecycleHooks | null
}

let currentLifecycle: Lifecycle | null = null

/**
 * 设置当前组件的生命周期上下文
 * 在组件渲染时调用
 */
export function setCurrentLifecycle(lifecycle: Lifecycle | null): void {
  currentLifecycle = lifecycle
}

export function getCurrentLifecycle(): Lifecycle | null {
  return currentLifecycle
}

/**
 * 创建组件生命周期对象
 * 每个组件实例都有一个独立的生命周期对象
 */
export function createLifecycle(): Lifecycle {
  return {
    hooks: {
      onMount: [],
      onCleanup: [],
    },
  }
}

/**
 * SolidJS 风格的 onMount
 * 注册一个在组件挂载后执行一次的回调
 * 类似于 React 的 useEffect(() => ..., [])
 */
export function onMount(callback: LifecycleHook): void {
  if (currentLifecycle && currentLifecycle.hooks) {
    currentLifecycle.hooks.onMount.push(callback)
  }
}

/**
 * SolidJS 风格的 onCleanup
 * 注册一个在组件卸载时执行的清理回调
 * 也可以在 createEffect 中使用，在 effect 重新执行前清理
 *
 * 这是 SolidJS 最重要的生命周期钩子之一，它的特点是：
 * 1. 在组件卸载时执行清理
 * 2. 在 effect 重新执行前先执行之前的清理
 * 3. 可以在任何追踪作用域中使用
 */
export function onCleanup(callback: LifecycleHook): void {
  if (currentLifecycle && currentLifecycle.hooks) {
    currentLifecycle.hooks.onCleanup.push(callback)
  }
}

/**
 * onUnmount 的别名，与 onCleanup 保持一致
 * 保留此别名以便与常见命名约定兼容
 */
export const onUnmount: (callback: LifecycleHook) => void = onCleanup

export function invokeArrayFns(fns: LifecycleHook[]): void {
  for (let i = 0; i < fns.length; i++) {
    fns[i]()
  }
}

/**
 * 调用 onMount 钩子
 * 使用 queuePostFlushCb 确保在 DOM 更新后执行
 */
export function invokeMountHook(lifecycle: Lifecycle): void {
  if (lifecycle.hooks && lifecycle.hooks.onMount.length) {
    queuePostFlushCb(function () {
      invokeArrayFns(lifecycle.hooks!.onMount)
    })
  }
}

/**
 * 调用 onCleanup 钩子
 * 在组件卸载时执行清理函数
 */
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
    lifecycle.hooks.onMount.length > 0 || lifecycle.hooks.onCleanup.length > 0
  )
}
