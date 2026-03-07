// packages/runtime-core/src/store/index.ts

import { computed, effect, signal } from '@zeus-js/signal'
import { extend, hasOwn } from '@zeus-js/shared'
import { render } from '@zeus-js/runtime-core'

// ============================================
// Store 类型定义
// ============================================

export interface StoreOptions<S extends object> {
  /** Store 的名称，用于调试 */
  name?: string
  /** 初始状态 */
  state?: S
  /** 严格模式，开启后不允许直接修改状态 */
  strict?: boolean
}

export interface StoreActions<S extends object> {
  /** 重置状态到初始值 */
  $reset: () => void
  /** 获取原始状态（不可响应） */
  $raw: () => S
}

// ============================================
// 内部状态管理
// ============================================

// Store 容器映射（支持多个独立 store）
const storeContainer = new Map<string, StoreImpl<any>>()

// ============================================
// Store 实现类
// ============================================

class StoreImpl<S extends object> {
  readonly name: string
  private _state: ReturnType<typeof signal<S>>
  private _initialState: S
  private _strict: boolean

  constructor(options: StoreOptions<S>) {
    this.name =
      options.name || `store-${Math.random().toString(36).slice(2, 9)}`
    this._strict = options.strict || false
    this._initialState = options.state
      ? this._deepClone(options.state)
      : ({} as S)
    this._state = signal(this._initialState)
  }

  get state(): ReturnType<typeof signal<S>> {
    return this._state
  }

  get $(): S {
    return this._state()
  }

  // 直接设置状态（严格模式下不可用）
  $set(newState: Partial<S> | ((state: S) => S)): void {
    if (this._strict) {
      throw new Error(
        `[Store "${this.name}"] $set() is not allowed in strict mode. Use $patch() instead.`,
      )
    }
    this.$patch(newState)
  }

  // 补丁式更新状态
  $patch(newState: Partial<S> | ((state: S) => S)): void {
    const currentState = this._state()
    let nextState: S

    if (typeof newState === 'function') {
      nextState = (newState as (state: S) => S)(currentState)
    } else {
      nextState = this._deepMerge(currentState, newState)
    }

    this._state(nextState as S)
  }

  // 重置到初始状态
  $reset(): void {
    this._state(this._deepClone(this._initialState) as S)
  }

  // 获取原始状态（非响应式）
  $raw(): S {
    // 使用 signal.peek() 获取原始值，如果不可用则返回当前值
    if (typeof (this._state as any).peek === 'function') {
      return (this._state as any).peek()
    }
    return this._state()
  }

  // 清理 store
  $dispose(): void {
    storeContainer.delete(this.name)
    this._state = signal(this._initialState)
  }

  // 内部方法：深拷贝
  private _deepClone<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value
    }
    if (Array.isArray(value)) {
      return value.map(item => this._deepClone(item)) as any
    }
    const result = {} as T
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = this._deepClone((value as any)[key])
      }
    }
    return result
  }

  // 内部方法：深合并
  private _deepMerge<T extends object>(target: T, source: Partial<T>): T {
    const result = extend({}, target) as T
    for (const key in source) {
      if (hasOwn(source, key)) {
        const sourceValue = (source as any)[key]
        const targetValue = (result as any)[key]
        if (
          sourceValue !== null &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue !== null &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          ;(result as any)[key] = this._deepMerge(targetValue, sourceValue)
        } else {
          ;(result as any)[key] = sourceValue
        }
      }
    }
    return result
  }
}

// ============================================
// Store 工厂函数
// ============================================

/**
 * 创建响应式 Store
 *
 * @example
 * ```ts
 * const useCounterStore = defineStore({
 *   name: 'counter',
 *   state: { count: 0, name: 'counter' },
 *   actions: {
 *     increment() {
 *       this.count++
 *     },
 *     decrement() {
 *       this.count--
 *     }
 *   }
 * })
 *
 * // 在组件中使用
 * const { count, increment } = useCounterStore()
 * ```
 */
export function defineStore<S extends object>(
  options: StoreOptions<S> & {
    actions?: Record<string, Function>
  },
): () => StoreImpl<S> & Omit<S, keyof StoreActions<S>> {
  const store = new StoreImpl<S>(options)
  storeContainer.set(store.name, store)

  // 附加 actions
  if (options.actions) {
    const actions = options.actions
    const actionKeys = Object.keys(actions)
    for (let i = 0; i < actionKeys.length; i++) {
      const key = actionKeys[i]
      const actionFn = (actions as any)[key]
      if (typeof actionFn === 'function') {
        ;(store as any)[key] = function (...args: any[]) {
          return actionFn.apply(store, args)
        }
      }
    }
  }

  return () => store as StoreImpl<S> & Omit<S, keyof StoreActions<S>>
}

/**
 * 获取已存在的 Store
 */
export function getStore<S extends object>(
  name: string,
): StoreImpl<S> | undefined {
  return storeContainer.get(name)
}

/**
 * 删除 Store
 */
export function removeStore(name: string): void {
  const store = storeContainer.get(name)
  if (store) {
    store.$dispose()
  }
}

// ============================================
// Store 上下文（Provide/Inject）
// ============================================

/**
 * Store 上下文键
 */
const storeContextKey = Symbol('zeus-store-context')

/**
 * Store 上下文条目
 */
interface StoreContextEntry {
  store: StoreImpl<any>
  cleanup?: () => void
}

/**
 * Store 上下文存储（支持栈结构）
 */
const storeContextStack: StoreContextEntry[] = []

/**
 * Provide Store 给后代组件
 *
 * @example
 * ```ts
 * const counterStore = defineStore({ state: { count: 0 } })
 *
 * function Parent() {
 *   provideStore(counterStore)
 *   return child()
 * }
 * ```
 */
export function provideStore(store: StoreImpl<any>): () => void {
  const entry: StoreContextEntry = { store }
  storeContextStack.push(entry)

  return () => {
    const index = storeContextStack.indexOf(entry)
    if (index > -1) {
      storeContextStack.splice(index, 1)
    }
  }
}

/**
 * Provide Store 给后代组件（使用 key）
 *
 * @example
 * ```ts
 * const counterStore = defineStore({ state: { count: 0 } })
 *
 * function Parent() {
 *   provideStore('counter', counterStore)
 *   return child()
 * }
 * ```
 */
export function provideStoreByKey<S extends object>(
  key: string | symbol,
  store: StoreImpl<S>,
): () => void {
  const entry: StoreContextEntry = { store }
  storeContextStack.push(entry)

  // 同时存储到全局键值映射中
  ;(storeContextKey as any).__stores =
    (storeContextKey as any).__stores || new Map()
  ;(
    (storeContextKey as any).__stores as Map<string | symbol, StoreImpl<any>>
  ).set(key, store)

  return () => {
    const index = storeContextStack.indexOf(entry)
    if (index > -1) {
      storeContextStack.splice(index, 1)
    }
    ;(
      (storeContextKey as any).__stores as Map<string | symbol, StoreImpl<any>>
    ).delete(key)
  }
}

/**
 * 注入最近的祖先提供的 Store
 */
export function injectStore<S extends object>(
  defaultStore?: StoreImpl<S>,
): StoreImpl<S> | undefined {
  // 从栈顶开始查找
  for (let i = storeContextStack.length - 1; i >= 0; i--) {
    const entry = storeContextStack[i]
    if (entry && entry.store) {
      return entry.store as StoreImpl<S>
    }
  }
  return defaultStore
}

/**
 * 通过 key 注入 Store
 */
export function injectStoreByKey<S extends object>(
  key: string | symbol,
  defaultStore?: StoreImpl<S>,
): StoreImpl<S> | undefined {
  const stores = (storeContextKey as any).__stores as
    | Map<string | symbol, StoreImpl<any>>
    | undefined
  if (stores) {
    const store = stores.get(key)
    if (store) {
      return store as StoreImpl<S>
    }
  }
  return defaultStore
}

// ============================================
// 组合式 Store 使用 Hook
// ============================================

/**
 * 使用 Store 的组合式 API
 *
 * @example
 * ```ts
 * const useCounterStore = defineStore({
 *   state: { count: 0 },
 *   actions: {
 *     increment() {
 *       this.count++
 *     }
 *   }
 * })
 *
 * function Counter() {
 *   const { count, increment } = useStore(useCounterStore)
 *   return <button onClick={increment}>{count}</button>
 * }
 * ```
 */
export function useStore<S extends object>(
  storeGetter: () => StoreImpl<S> & Omit<S, keyof StoreActions<S>>,
): StoreImpl<S> & Omit<S, keyof StoreActions<S>> {
  return storeGetter()
}

/**
 * 注入并使用 Store
 *
 * @example
 * ```ts
 * function Counter() {
 *   const store = useInjectStore('counter')
 *   return <div>{store.count}</div>
 * }
 * ```
 */
export function useInjectStore<S extends object>(
  key?: string | symbol,
  defaultStore?: StoreImpl<S>,
): StoreImpl<S> | undefined {
  if (key) {
    return injectStoreByKey<S>(key, defaultStore)
  }
  return injectStore<S>(defaultStore)
}

// ============================================
// 计算属性
// ============================================

/**
 * 创建计算属性
 *
 * @example
 * ```ts
 * const doubleCount = computed(() => store.count * 2)
 * ```
 */
export function createComputed<T>(getter: () => T): () => T {
  return computed(getter)
}

// ============================================
// 副作用
// ============================================

/**
 * 创建副作用
 *
 * @example
 * ```ts
 * effect(() => {
 *   console.log(store.count)
 * })
 * ```
 */
export function createEffect(fn: () => void): () => void {
  return effect(fn)
}

// ============================================
// Web Component 兼容性
// ============================================

/**
 * Store 在 Web Component 间传递的事件名
 */
const STORE_PROVIDE_EVENT = 'zeus-store-provide'

/**
 * Web Component Store 提供者混入
 *
 * @example
 * ```ts
 * class MyElement extends provideStoreMixin(HTMLElement) {
 *   connectedCallback() {
 *     const store = defineStore({ state: { value: 1 } })
 *     this.provideStore(store)
 *   }
 * }
 * ```
 */
export function provideStoreMixin(): new () => ProvideStoreHost {
  class ProvideStoreHost {
    private _providedStores: Map<string | symbol, StoreImpl<any>> = new Map()

    provideStore(store: StoreImpl<any>): void {
      this._providedStores.set(store.name, store)
      this._dispatchStoreEvent('provide', store)
    }

    provideStoreByKey(key: string | symbol, store: StoreImpl<any>): void {
      this._providedStores.set(key, store)
      this._dispatchStoreEvent('provide', store, key)
    }

    private _dispatchStoreEvent(
      type: 'provide',
      store: StoreImpl<any>,
      key?: string | symbol,
    ): void {
      const event = new CustomEvent(STORE_PROVIDE_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          type,
          store,
          key,
          source: this,
        },
      })
      const dispatchFn = (this as any).dispatchEvent
      if (dispatchFn) {
        dispatchFn.call(this, event)
      }
    }

    getProvidedStores(): Map<string | symbol, StoreImpl<any>> {
      return new Map(this._providedStores)
    }
  }

  return ProvideStoreHost as any
}

/**
 * Web Component Store 消费者混入
 *
 * @example
 * ```ts
 * class MyConsumerElement extends consumeStoreMixin(HTMLElement) {
 *   connectedCallback() {
 *     this.addEventListener('zeus-store-provide', (e) => {
 *       const store = this.getStoreFromEvent(e)
 *       console.log(store.count)
 *     })
 *   }
 * }
 * ```
 */
export function consumeStoreMixin(): new () => ConsumeStoreHost {
  class ConsumeStoreHost {
    private _consumedStores: Map<string | symbol, StoreImpl<any>> = new Map()
    private _storeListeners: ((event: Event) => void)[] = []

    consumeStore(
      callback: (store: StoreImpl<any>, key?: string | symbol) => void,
    ): () => void {
      const listener = (event: Event) => {
        const detail = (event as CustomEvent).detail
        if (detail && detail.type === 'provide') {
          callback(detail.store, detail.key)
        }
      }

      this._storeListeners.push(listener)
      document.addEventListener(STORE_PROVIDE_EVENT, listener)

      return () => {
        const index = this._storeListeners.indexOf(listener)
        if (index > -1) {
          this._storeListeners.splice(index, 1)
        }
        document.removeEventListener(STORE_PROVIDE_EVENT, listener)
      }
    }

    getStore(key?: string | symbol): StoreImpl<any> | undefined {
      if (key) {
        return this._consumedStores.get(key)
      }
      // 返回第一个找到的 store
      const stores = this._consumedStores.values()
      return stores.next().value
    }

    // 内部方法：用于事件处理
    __addConsumedStore(store: StoreImpl<any>, key?: string | symbol): void {
      const storeKey = key || store.name
      this._consumedStores.set(storeKey, store)
    }

    disconnectedCallback?(): void {
      // 清理事件监听
      for (let i = 0; i < this._storeListeners.length; i++) {
        document.removeEventListener(
          STORE_PROVIDE_EVENT,
          this._storeListeners[i],
        )
      }
      this._storeListeners = []
    }
  }

  return ConsumeStoreHost as any
}

/**
 * 创建支持 Store 的 Web Component
 *
 * @example
 * ```ts
 * const useCounterStore = defineStore({
 *   state: { count: 0 },
 *   actions: {
 *     increment() { this.count++ }
 *   }
 * })
 *
 * function Counter({ count, increment }) {
 *   return <button onClick={increment}>{count}</button>
 * }
 *
 * createStoreWebComponent('my-counter', Counter, () => useCounterStore())
 * ```
 */
export function createStoreWebComponent<P extends object>(
  tagName: string,
  component: (props: P) => Node,
  storeGetter: () => StoreImpl<any>,
  options?: {
    shadow?: boolean
    observedAttributes?: string[]
  },
): typeof HTMLElement {
  const useShadow = options && options.shadow ? options.shadow : false
  const observed =
    options && options.observedAttributes ? options.observedAttributes : []

  return class extends HTMLElement {
    private _root: Element | ShadowRoot | null = null
    private _mounted = false
    private _props: P
    private _cleanupStore: (() => void) | null = null
    private _store: StoreImpl<any> | null = null

    static get observedAttributes(): string[] {
      return observed
    }

    constructor() {
      super()
      this._props = {} as P
      this._root = null
    }

    connectedCallback(): void {
      if (this._mounted) return

      // 获取 store
      this._store = storeGetter()

      // 提供 store 给后代
      this._cleanupStore = provideStore(this._store)

      // 初始化渲染根
      if (useShadow) {
        this._root = this.shadowRoot || this.attachShadow({ mode: 'open' })
      } else {
        this._root = this
      }

      // 渲染组件
      this._render()

      this._mounted = true
    }

    disconnectedCallback(): void {
      if (!this._mounted) return

      // 清理 store 提供
      if (this._cleanupStore) {
        this._cleanupStore()
        this._cleanupStore = null
      }

      if (this._root) {
        ;(this._root as Element).innerHTML = ''
      }

      this._mounted = false
    }

    attributeChangedCallback(
      name: string,
      _oldValue: string | null,
      newValue: string | null,
    ): void {
      ;(this._props as any)[name] = newValue
      if (this._mounted && this._root) {
        this._render()
      }
    }

    private _render(): void {
      if (!this._root) return

      // 使用 runtime-core 的 render 函数渲染组件
      render(() => component(this._props), this._root as Element)
    }
  }
}

// ============================================
// 类型导出
// ============================================

export type { StoreImpl as Store }

export interface StoreHost {
  provideStore(store: StoreImpl<any>): void
  provideStoreByKey(key: string | symbol, store: StoreImpl<any>): void
}

interface ProvideStoreHost {
  provideStore(store: StoreImpl<any>): void
  provideStoreByKey(key: string | symbol, store: StoreImpl<any>): void
  getProvidedStores(): Map<string | symbol, StoreImpl<any>>
}

interface ConsumeStoreHost {
  consumeStore(
    callback: (store: StoreImpl<any>, key?: string | symbol) => void,
  ): () => void
  getStore(key?: string | symbol): StoreImpl<any> | undefined
}
