import { useEffect } from '@zeus-js/reactivity'

function untrack(children: any) {}

function runLifecycles(rootComponent: any, lifecycle: string) {}

// 渲染到DOM
export function render(code: any, container: HTMLElement | string): () => void {
  // 获取容器元素
  const root =
    typeof container === 'string'
      ? document.querySelector(container)
      : container

  if (!root) {
    throw new Error(`Target container not found: ${container}`)
  }

  // 清空容器
  root.textContent = ''

  // 创建根组件
  const rootComponent = {}
  const dispose = new Set<() => void>()

  // 运行并插入内容
  useEffect(() => {
    // 执行渲染函数
    const result = untrack(() => (typeof code === 'function' ? code() : code))

    // 清理之前的内容
    dispose.forEach(fn => fn())
    dispose.clear()

    // 插入新内容
    if (result != null) {
      if (Array.isArray(result)) {
        result.forEach(node => {
          if (node instanceof Node) {
            root.appendChild(node)
            // 添加清理函数
            dispose.add(() => node.remove())
          }
        })
      } else if (result instanceof Node) {
        root.appendChild(result)
        // 添加清理函数
        dispose.add(() => result.remove())
      } else {
        const textNode = document.createTextNode(String(result))
        root.appendChild(textNode)
        // 添加清理函数
        dispose.add(() => textNode.remove())
      }
    }

    // 运行挂载生命周期钩子
    runLifecycles(rootComponent, 'mount')
  })

  // 返回清理函数
  return () => {
    dispose.forEach(fn => fn())
    dispose.clear()
    root.textContent = ''
    // 运行清理生命周期钩子
    runLifecycles(rootComponent, 'cleanup')
  }
}

// 从服务端渲染的HTML进行水合
export function hydrate(
  code: any,
  container: HTMLElement | string
): () => void {
  // 获取容器元素
  const root =
    typeof container === 'string'
      ? document.querySelector(container)
      : container

  if (!root) {
    throw new Error(`Target container not found: ${container}`)
  }

  // 创建根组件
  const rootComponent = {}
  const dispose = new Set<() => void>()

  // 运行代码但不清空容器（保留现有DOM）
  useEffect(() => {
    // 执行渲染函数
    const result = untrack(() => (typeof code === 'function' ? code() : code))

    // 运行挂载生命周期钩子
    runLifecycles(rootComponent, 'mount')
  })

  // 返回清理函数
  return () => {
    dispose.forEach(fn => fn())
    dispose.clear()
    root.textContent = ''
    // 运行清理生命周期钩子
    runLifecycles(rootComponent, 'cleanup')
  }
}
