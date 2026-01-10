// packages/signal/src/reactivity/index.ts

// 响应式原语
export function signal<T>(initialValue: T): Signal<T> {
  // 基于 alien-signal 的实现
  return {} as Signal<T>
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  // 基于 alien-signal 的实现
  return {} as ReadonlySignal<T>
}

export function effect(fn: () => void): Effect {
  // 基于 alien-signal 的实现
  return {} as Effect
}

// 批量更新
export function batch<T>(fn: () => T): T {
  return fn()
}

// 观察者模式
export function observe<T>(
  signal: Signal<T>,
  callback: (value: T) => void,
): () => void {
  return () => {}
}

// 类型定义
export interface Signal<T> {
  (): T
  (value: T): T
  readonly value: T
}

export interface ReadonlySignal<T> {
  (): T
  readonly value: T
}

export interface Effect {
  destroy(): void
}
