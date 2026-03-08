// addons/store/src/composables.ts

import { computed, signal } from '@zeus-js/signal'
import { extend } from '@zeus-js/shared'
import type { CreatePiniaOptions, Pinia, Store } from './types'

// ============================================
// Store 存储
// ============================================

const storeInstances = new Map<string, Store>()

// ============================================
// 创建 Store（内部实现）
// ============================================

/**
 * 创建 Store 实例
 */
function createStoreInstance<S = any>(
  options: {
    name: string
    state?: () => S
    getters?: Record<string, (state: S) => any>
    actions?: Record<string, (...args: any[]) => any>
  },
  piniaId?: string,
): Store<S> {
  const name = options.name

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
          {
            $state: stateSignal(),
            $getters: getters,
            $actions: actions,
          },
          args,
        )
      }
    }
  }

  // 订阅者
  const subscribers = new Set<(state: S) => void>()

  // 响应式代理
  const stateProxy = new Proxy({} as any, {
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

  // 创建 Store 实例
  const store: Store<S> = {
    get $name() {
      return name
    },

    get $state() {
      return stateProxy as any
    },

    $raw() {
      return stateSignal() as any
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
      storeInstances.delete(piniaId ? `${piniaId}:${name}` : name)
    },
  }

  // 存储实例
  const storeKey = piniaId ? `${piniaId}:${name}` : name
  storeInstances.set(storeKey, store as Store)

  return store
}

// ============================================
// 创建 Pinia 实例
// ============================================

/**
 * 创建 Pinia 实例
 *
 * @example
 * ```ts
 * const pinia = createPinia()
 * const store = pinia.use({
 *   name: 'counter',
 *   state: () => ({ count: 0 }),
 *   actions: {
 *     increment() {
 *       this.count++
 *     }
 *   }
 * })
 * ```
 */
export function createPinia(options?: CreatePiniaOptions): Pinia {
  const piniaId = Math.random().toString(36).slice(2, 9)

  const pinia: Pinia = {
    install(_app: any) {
      // Pinia 安装逻辑
    },

    use<S>(storeOptions: any): Store<S> {
      return createStoreInstance(
        extend({}, storeOptions, { _pinia: piniaId }),
        piniaId,
      ) as Store<S>
    },
  }

  return pinia
}

// ============================================
// 组合式 API - useStore
// ============================================

/**
 * 使用 Store（组合式 API）
 */
export function useStore<S = any>(storeGetter: () => Store<S>): Store<S> {
  return storeGetter()
}

/**
 * 获取已安装的 Store（通过名称）
 */
export function injectStore<S = any>(
  name: string,
  piniaId?: string,
): Store<S> | undefined {
  const storeKey = piniaId ? `${piniaId}:${name}` : name
  return storeInstances.get(storeKey) as Store<S> | undefined
}
