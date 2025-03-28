import { getCurrentInstance } from './component'
import type { ComponentInternalInstance } from './component'

export const enum LifecycleHooks {
  BEFORE_MOUNT = 'bm',
  MOUNTED = 'm',
  BEFORE_UPDATE = 'bu',
  UPDATED = 'u',
  BEFORE_UNMOUNT = 'bum',
  UNMOUNTED = 'um',
  ERROR_CAPTURED = 'ec',
}

function injectHook(
  type: LifecycleHooks,
  hook: Function,
  instance: ComponentInternalInstance
) {
  if (!instance) {
    console.warn(`${type} hook can only be used inside setup().`)
    return
  }

  // 将钩子函数添加到实例上
  const hooks = instance[type] || (instance[type] = [])
  hooks.push(hook)
}

export function onBeforeMount(hook: Function) {
  injectHook(LifecycleHooks.BEFORE_MOUNT, hook, getCurrentInstance()!)
}

export function onMounted(hook: Function) {
  injectHook(LifecycleHooks.MOUNTED, hook, getCurrentInstance()!)
}

export function onBeforeUpdate(hook: Function) {
  injectHook(LifecycleHooks.BEFORE_UPDATE, hook, getCurrentInstance()!)
}

export function onUpdated(hook: Function) {
  injectHook(LifecycleHooks.UPDATED, hook, getCurrentInstance()!)
}

export function onBeforeUnmount(hook: Function) {
  injectHook(LifecycleHooks.BEFORE_UNMOUNT, hook, getCurrentInstance()!)
}

export function onUnmounted(hook: Function) {
  injectHook(LifecycleHooks.UNMOUNTED, hook, getCurrentInstance()!)
}

export function onErrorCaptured(hook: Function) {
  injectHook(LifecycleHooks.ERROR_CAPTURED, hook, getCurrentInstance()!)
}
