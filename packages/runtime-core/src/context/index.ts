// packages/runtime-core/src/context/index.ts

import type { Component, ComponentProps } from '../component'

export interface Context<T> {
  Provider: Component
  Consumer: Component
  defaultValue: T
  _contextId: symbol
}

let contextId = 0
const contextMap = new WeakMap<object, Map<symbol, any>>()

export function createContext<T>(defaultValue: T): Context<T> {
  const id = Symbol(`context-${contextId++}`)

  const Provider: Component = {
    name: 'ContextProvider',
    setup(props: ComponentProps = {}) {
      const value = props.value !== undefined ? props.value : defaultValue

      return () => {
        // 在子组件中提供上下文值
        const currentInstance = getCurrentInstance()
        if (currentInstance) {
          let instanceMap = contextMap.get(currentInstance)
          if (!instanceMap) {
            instanceMap = new Map()
            contextMap.set(currentInstance, instanceMap)
          }
          instanceMap.set(id, value)
        }

        // 返回默认的fragment或传入的children
        return props.children || document.createDocumentFragment()
      }
    },
  }

  const Consumer: Component = {
    name: 'ContextConsumer',
    setup(props?: ComponentProps) {
      return () => {
        if (props && typeof props.children === 'function') {
          const value = useContext({
            _contextId: id,
            defaultValue,
          } as Context<T>)
          return props.children(value)
        }
        return document.createDocumentFragment()
      }
    },
  }

  return {
    Provider,
    Consumer,
    defaultValue,
    _contextId: id,
  }
}

export function useContext<T>(context: Context<T>): T {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    const instanceMap = contextMap.get(currentInstance)
    if (instanceMap) {
      const value = instanceMap.get(context._contextId)
      if (value !== undefined) {
        return value
      }
    }

    // 检查父实例
    let parent = currentInstance as any
    while (parent && parent.$parent) {
      parent = parent.$parent
      const parentMap = contextMap.get(parent)
      if (parentMap) {
        const value = parentMap.get(context._contextId)
        if (value !== undefined) {
          return value
        }
      }
    }
  }

  return context.defaultValue
}

export function provide<T>(key: symbol | string, value: T): void {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    let instanceMap = contextMap.get(currentInstance)
    if (!instanceMap) {
      instanceMap = new Map()
      contextMap.set(currentInstance, instanceMap)
    }
    instanceMap.set(typeof key === 'string' ? Symbol.for(key) : key, value)
  }
}

export function inject<T>(key: symbol | string, defaultValue?: T): T {
  const currentInstance = getCurrentInstance()
  if (currentInstance) {
    const instanceMap = contextMap.get(currentInstance)
    if (instanceMap) {
      const symbolKey = typeof key === 'string' ? Symbol.for(key) : key
      const value = instanceMap.get(symbolKey)
      if (value !== undefined) {
        return value
      }
    }

    // 检查父实例
    let parent = currentInstance as any
    while (parent && parent.$parent) {
      parent = parent.$parent
      const parentMap = contextMap.get(parent)
      if (parentMap) {
        const symbolKey = typeof key === 'string' ? Symbol.for(key) : key
        const value = parentMap.get(symbolKey)
        if (value !== undefined) {
          return value
        }
      }
    }
  }

  if (defaultValue !== undefined) {
    return defaultValue
  }

  throw new Error(`Injection "${String(key)}" not found`)
}

// 导入实例管理函数
import { getCurrentInstance } from '../lifecycle'
