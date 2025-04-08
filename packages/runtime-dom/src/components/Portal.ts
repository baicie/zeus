import { useEffect } from '@zeus-js/reactivity'

function onCleanup(fn: () => void) {}

// 传送门组件 - 将内容渲染到DOM中的特定位置
export function Portal({
  mount,
  children,
}: {
  mount: HTMLElement | string
  children: any
}): any {
  // 获取挂载点
  const container =
    typeof mount === 'string' ? document.querySelector(mount) : mount

  if (!container) {
    console.error(`Portal target not found:`, mount)
    return document.createComment('portal:invalid-target')
  }

  // 创建标记注释
  const marker = document.createComment('portal')

  // 渲染子元素到挂载点
  useEffect(() => {
    const content = typeof children === 'function' ? children() : children

    // 清空之前的内容
    container.textContent = ''

    // 插入新内容
    if (content instanceof Node) {
      container.appendChild(content)
    } else if (Array.isArray(content)) {
      content.forEach(node => {
        if (node instanceof Node) {
          container.appendChild(node)
        } else {
          container.appendChild(document.createTextNode(String(node)))
        }
      })
    } else if (content != null) {
      container.appendChild(document.createTextNode(String(content)))
    }
  })

  // 清理
  onCleanup(() => {
    container.textContent = ''
  })

  // 返回一个标记注释，占位原位置
  return marker
}
