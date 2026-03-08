// addons/store/src/options.ts

import { computed, signal } from '@zeus-js/signal'
import { extend } from '@zeus-js/shared'
import type { Store, StoreOptions } from './types'

// ============================================
// Store 存储
// ============================================

const storeCache = new Map<string, Store>()

// ============================================
// 创建 Store（选项式 API）
// ============================================

/**
 * 定义 Store（选项式 API，类似 Vue3 Pinia）
 *
 * @example
 * ```ts
 * const useCounterStore = defineStore({
 *   name: 'counter',
 *   state: () => ({ count: 0 }),
 *   getters: {
 *     doubleCount: (state) => state.count * 2
 *   },
 *   actions: {
 *     increment() {
 *       this.count++
 *     }
 *   }
 * })
 *
 * const store = useCounterStore()
 * store.$state.count++
 * ```
 */
export function defineStore<S = any>(options: StoreOptions<S>): () => Store<S> {
  const name = options.name || `store-${Math.random().toString(36).slice(2, 9)}`

  // 检查缓存
  if (storeCache.has(name)) {
    return () => storeCache.get(name)! as Store<S>
  }

  // 初始化状态
  const initialState = options.state ? options.state() : ({} as S)
  const stateSignal = signal<S>(initialState as any)

  // Getters
  const getters: Record<string, () => any> = {}
  if (options.getters) {
    for (const key in options.getters) {
      const getter = options.getters[key]
      getters[key] = computed(() => getter(stateSignal()))
    }
  }

  // Actions
  const actions: Record<string, Function> = {}
  if (options.actions) {
    for (const key in options.actions) {
      const actionFn = options.actions[key]
      actions[key] = function (...args: any[]) {
        return actionFn.apply(
          extend({}, getters, actions, {
            $state: stateSignal(),
          }),
          args,
        )
      }
    }
  }

  // 订阅者
  const subscribers = new Set<(state: S) => void>()

  // 创建 Store 实例
  const store: Store<S> = {
    get $name() {
      return name
    },

    get $state() {
      return new Proxy({} as any, {
        get(_target: any, prop: string) {
          if (getters[prop]) {
            return getters[prop]()
          }
          if (actions[prop]) {
            return actions[prop]
          }
          return (stateSignal() as any)[prop]
        },
        set(_target: any, prop: string, value: any) {
          const currentState = stateSignal()
          stateSignal(extend({}, currentState, { [prop]: value }))
          subscribers.forEach(cb => cb(stateSignal()))
          return true
        },
      })
    },

    get $raw() {
      return stateSignal() as any
    },

    get $actions() {
      return actions
    },

    $reset() {
      const initial = options.state ? options.state() : ({} as S)
      stateSignal(initial as any)
      subscribers.forEach(cb => cb(stateSignal()))
    },

    $patch(partial: any) {
      const currentState = stateSignal()
      let newPartial: any

      if (typeof partial === 'function') {
        newPartial = partial(currentState)
      } else {
        newPartial = partial
      }

      stateSignal(extend({}, currentState, newPartial))

      subscribers.forEach(cb => cb(stateSignal()))
    },

    $replace(newState: S) {
      stateSignal(newState as S)
      subscribers.forEach(cb => cb(stateSignal()))
    },

    $subscribe(callback: (state: S) => void) {
      subscribers.add(callback)
      callback(stateSignal())

      return () => {
        subscribers.delete(callback)
      }
    },

    $dispose() {
      subscribers.clear()
      storeCache.delete(name)
    },
  }

  // 缓存
  storeCache.set(name, store as Store)

  // 返回工厂函数
  const useStore = (): Store<S> => {
    return store as Store<S>
  }

  // 挂载属性到返回的函数上
  ;(useStore as any).$store = store

  return useStore
}

/**
 * 注入 Store
 */
export function useStoreByKey<S = any>(name: string): Store<S> | undefined {
  return storeCache.get(name) as Store<S> | undefined
}

/**
 * 获取已缓存的 Store
 */
export function getCachedStore<S = any>(name: string): Store<S> | undefined {
  return storeCache.get(name) as Store<S> | undefined
}

/**
 * 清除所有缓存的 Store
 */
export function resetAllStores(): void {
  storeCache.forEach(store => {
    store.$dispose()
  })
  storeCache.clear()
}
