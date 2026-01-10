// packages/signal/src/utils/index.ts

// 工具函数
export function isSignal<T>(value: any): value is Signal<T> {
  return typeof value === 'function' && value.length <= 1
}

export function isComputed<T>(value: any): value is ReadonlySignal<T> {
  return typeof value === 'function' && value.length === 0
}

export function untrack<T>(fn: () => T): T {
  return fn()
}

import type { Signal } from '../reactivity'
