import { useMemo } from '@zeus-js/reactivity'
import { AbstractShow } from '@zeus-js/runtime-core'

// DOM特定的Show实现
export function Show<T>({
  when,
  children,
  fallback,
}: {
  when: boolean | (() => boolean)
  children: T
  fallback?: T
}): any {
  const showComponent = new AbstractShow({ when, children, fallback })

  return useMemo(() => {
    const result = showComponent.process()

    // DOM特定的处理
    if (result === undefined || result === null) {
      // 返回占位符注释节点
      return document.createComment('show:empty')
    }

    if (typeof result === 'function') {
      return result()
    }

    if (result instanceof Node) {
      return result
    }

    return document.createTextNode(String(result))
  })
}
