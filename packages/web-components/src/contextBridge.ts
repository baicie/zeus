// packages/web-components/src/contextBridge.ts
import { useEffect, useState } from '@zeus-js/reactivity'

// 在 Web Component 和 Zeus 组件之间桥接上下文
export function contextBridge(contextMap: Record<string, any> = {}) {
  return {
    provide(element: HTMLElement) {
      // 将上下文附加到元素上
      Object.entries(contextMap).forEach(([key, context]) => {
        ;(element as any)._zeusContext = (element as any)._zeusContext || {}
        ;(element as any)._zeusContext[key] = context
      })
    },

    consume<T>(key: string, defaultValue?: T): () => T {
      // 创建一个状态来跟踪上下文
      const [value, setValue] = useState<T | undefined>(defaultValue)

      // 在组件挂载时尝试访问上下文
      useEffect(() => {
        // 查找最近的带有上下文的自定义元素
        let current = document.currentScript?.parentElement
        while (current) {
          if (
            (current as any)._zeusContext &&
            (current as any)._zeusContext[key] !== undefined
          ) {
            setValue((current as any)._zeusContext[key])
            break
          }
          current = current.parentElement
        }
      })

      return () => value as T
    },
  }
}
