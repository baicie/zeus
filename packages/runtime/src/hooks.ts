import { computed, effect, signal } from '@zeus-js/signals'

/**
 * 函数式组件中的 Hooks 实现
 * 提供类似 React Hooks 的 API
 */

/**
 * 状态 Hook
 * 在函数式组件中创建响应式状态
 * 返回一个 signal 函数，可以直接调用获取值，或传入参数设置值
 */
export function useState<T>(initialValue: T): (value?: T) => T {
  return signal(initialValue)
}

/**
 * 计算属性 Hook
 * 基于其他状态创建派生状态
 */
export function useComputed<T>(fn: () => T): () => T {
  return computed(fn)
}

/**
 * 副作用 Hook
 * 处理副作用，如 DOM 操作、API 调用等
 */
export function useEffect(
  fn: () => void | (() => void),
  deps?: any[],
): () => void {
  return effect(fn)
}

/**
 * 引用 Hook
 * 创建一个可变的引用对象
 */
export function useRef<T>(initialValue: T): { current: T } {
  const refSignal = signal(initialValue)

  return {
    get current() {
      return refSignal()
    },
    set current(value: T) {
      refSignal(value)
    },
  }
}

/**
 * 回调 Hook
 * 返回一个稳定的回调函数引用
 */
export function useCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps?: any[],
): T {
  const callbackSignal = useState(callback)

  useEffect(() => {
    callbackSignal(callback)
  }, deps)

  return callbackSignal() as T
}

/**
 * 记忆化 Hook
 * 缓存计算结果
 */
export function useMemo<T>(factory: () => T, deps?: any[]): () => T {
  return useComputed(factory)
}

/**
 * 生命周期 Hook
 */
export const lifecycle = {
  /**
   * 组件挂载时执行
   */
  onMounted: (fn: () => void): (() => void) => {
    return useEffect(fn, [])
  },

  /**
   * 组件卸载时执行
   */
  onUnmounted: (fn: () => void): (() => void) => {
    return useEffect(() => {
      return fn
    }, [])
  },

  /**
   * 组件更新时执行
   */
  onUpdated: (fn: () => void): (() => void) => {
    return useEffect(fn)
  },
}

/**
 * 属性 Hook
 * 获取和设置组件属性
 */
export function useAttributes() {
  const attributesSignal = useState<Record<string, string>>({})

  return {
    get: (name: string): string | undefined => attributesSignal()[name],
    set: (name: string, value: string): void => {
      const current = attributesSignal()
      attributesSignal(Object.assign({}, current, { [name]: value }))
    },
    has: (name: string): boolean => name in attributesSignal(),
    remove: (name: string): void => {
      const current = attributesSignal()
      const next = Object.assign({}, current)
      delete next[name]
      attributesSignal(next)
    },
    getAll: (): Record<string, string> => attributesSignal(),
  }
}

/**
 * 事件 Hook
 * 处理组件事件
 */
export function useEvents() {
  const eventsSignal = useState<Record<string, EventListener[]>>({})

  return {
    emit: (eventName: string, detail?: any): void => {
      const event = new CustomEvent(eventName, { detail })
      const listeners = eventsSignal()[eventName] || []
      listeners.forEach((listener: EventListener) => listener(event))
    },
    on: (eventName: string, listener: EventListener): void => {
      const current = eventsSignal()
      const existingListeners = current[eventName] || []
      eventsSignal(
        Object.assign({}, current, {
          [eventName]: [...existingListeners, listener],
        }),
      )
    },
    off: (eventName: string, listener: EventListener): void => {
      const current = eventsSignal()
      const existingListeners = current[eventName] || []
      eventsSignal(
        Object.assign({}, current, {
          [eventName]: existingListeners.filter(
            (l: EventListener) => l !== listener,
          ),
        }),
      )
    },
  }
}
