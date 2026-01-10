// packages/runtime-core/src/context/index.ts

export interface Context<T> {
  Provider: Component
  Consumer: Component
  defaultValue: T
}

export function createContext<T>(defaultValue: T): Context<T> {
  return {
    Provider: {} as Component,
    Consumer: {} as Component,
    defaultValue,
  }
}

export function useContext<T>(context: Context<T>): T {
  return context.defaultValue
}

export function provide<T>(key: symbol | string, value: T): void {
  // 实现provide逻辑
}

export function inject<T>(key: symbol | string, defaultValue?: T): T {
  return defaultValue as T
}

import type { Component } from '../component'
