// packages/runtime-core/src/context/index.ts

// 纯函数式上下文管理
export interface Context<T> {
  id: symbol
  defaultValue: T
}

let contextId = 0

// 上下文存储栈
const contextStack: Map<symbol, any>[] = []

export function createContext<T>(defaultValue: T): Context<T> {
  return {
    id: Symbol(`context-${contextId++}`),
    defaultValue,
  }
}

// 进入上下文作用域
export function provideContext<T>(context: Context<T>, value: T): () => void {
  const currentContext = new Map(contextStack[contextStack.length - 1] || [])
  currentContext.set(context.id, value)
  contextStack.push(currentContext)

  // 返回清理函数
  return () => {
    contextStack.pop()
  }
}

// 获取上下文值
export function useContext<T>(context: Context<T>): T {
  // 从栈顶开始查找
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const value = contextStack[i].get(context.id)
    if (value !== undefined) {
      return value
    }
  }
  return context.defaultValue
}

// 函数式 provide/inject
export function provide<T>(key: symbol | string, value: T): () => void {
  const symbolKey = typeof key === 'string' ? Symbol.for(key) : key
  const currentContext = new Map(contextStack[contextStack.length - 1] || [])
  currentContext.set(symbolKey, value)
  contextStack.push(currentContext)

  return () => {
    contextStack.pop()
  }
}

export function inject<T>(key: symbol | string, defaultValue?: T): T {
  const symbolKey = typeof key === 'string' ? Symbol.for(key) : key

  // 从栈顶开始查找
  for (let i = contextStack.length - 1; i >= 0; i--) {
    const value = contextStack[i].get(symbolKey)
    if (value !== undefined) {
      return value
    }
  }

  if (defaultValue !== undefined) {
    return defaultValue
  }

  throw new Error(`Injection "${String(key)}" not found`)
}

// 高阶组件：提供上下文
export function withProvider<T>(
  context: Context<T>,
  value: T,
): <P extends any>(component: (props: P) => any) => (props: P) => any {
  return <P extends any>(component: (props: P) => any) => {
    return (props: P) => {
      const cleanup = provideContext(context, value)
      try {
        return component(props)
      } finally {
        cleanup()
      }
    }
  }
}

// 高阶组件：消费上下文
export function withConsumer<T>(
  context: Context<T>,
): <P extends any>(
  component: (props: P & { contextValue: T }) => any,
) => (props: P) => any {
  return <P extends any>(
    component: (props: P & { contextValue: T }) => any,
  ) => {
    return (props: P) => {
      const contextValue = useContext(context)
      return component(Object.assign({}, props, { contextValue }))
    }
  }
}
