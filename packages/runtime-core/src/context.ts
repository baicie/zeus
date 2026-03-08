// Context 类型定义

export interface Context<T> {
  /** Context 唯一标识 */
  id: symbol
  /** 默认值 */
  defaultValue: T
  /** Provider 组件 */
  Provider: (props: ContextProviderProps<T>) => any
}

export interface ContextProviderProps<T> {
  value: T
  children?: any
}

let contextIdCounter = 0

// 上下文存储栈
const contextStack: Map<symbol, any>[] = []

/**
 * 创建 Context
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const id = Symbol(`zeus-context-${contextIdCounter++}`)

  // Provider 组件
  const Provider = (props: ContextProviderProps<T>) => {
    provide(props.value, id)
    return props.children
  }

  return {
    id,
    defaultValue,
    Provider,
  }
}

/**
 * 提供 Context 值
 */
export function provide<T>(value: T, contextId: symbol): void {
  const currentContext = new Map(contextStack[contextStack.length - 1] || [])
  currentContext.set(contextId, value)
  contextStack.push(currentContext)
}

/**
 * 使用 Context（类似 React.useContext）
 */
export function useContext<T>(context: Context<T>): T {
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const value = contextStack[i].get(context.id)
    if (value !== undefined) {
      return value
    }
  }
  return context.defaultValue
}
