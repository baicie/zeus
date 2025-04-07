import { useMemo } from '@zeus-js/reactivity'
import { AbstractFor } from '@zeus-js/runtime-core'

// DOM特定的For实现
export function For<T>({
  each,
  children,
}: {
  each: T[] | (() => T[])
  children: (item: T, index: number) => any
}): any[] {
  const forComponent = new AbstractFor({ each, children })

  return useMemo(() => {
    const result = forComponent.process()

    // DOM特定的处理，如加入标记以支持高效更新
    const fragment = document.createDocumentFragment()
    const nodes = result.map((item, index) => {
      const node = typeof item === 'function' ? item() : item

      if (node instanceof Node) {
        // 添加特殊属性用于跟踪和更新
        ;(node as any)._$forIndex = index
        fragment.appendChild(node)
      } else if (node != null) {
        const textNode = document.createTextNode(String(node))
        ;(textNode as any)._$forIndex = index
        fragment.appendChild(textNode)
      }

      return node instanceof Node ? node : textNode
    })

    return fragment
  })
}
