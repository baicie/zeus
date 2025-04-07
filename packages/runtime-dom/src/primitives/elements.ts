import { useEffect } from '@zeus-js/reactivity'

// 创建DOM元素
export function createElement(tag: string): HTMLElement {
  return document.createElement(tag)
}

// 设置单个属性
export function setProperty(el: HTMLElement, name: string, value: any): void {
  if (value === null || value === undefined) {
    el.removeAttribute(name)
    return
  }

  if (name === 'className') name = 'class'

  if (name in el && !(el instanceof SVGElement)) {
    try {
      el[name] = value
    } catch (e) {
      el.setAttribute(name, value)
    }
  } else {
    el.setAttribute(name, value)
  }
}

// 设置DOM属性
export function setAttribute(el: HTMLElement, name: string, value: any): void {
  if (value === null || value === undefined) {
    el.removeAttribute(name)
  } else {
    el.setAttribute(name, value)
  }
}

// 设置类名列表
export function setClassList(
  el: HTMLElement,
  value: string | string[] | Record<string, boolean>
): void {
  if (Array.isArray(value)) {
    el.className = value.join(' ')
  } else if (value && typeof value === 'object') {
    const names = Object.keys(value).filter(k => value[k])
    el.className = names.join(' ')
  } else {
    el.className = value || ''
  }
}

// 设置样式
export function setStyle(
  el: HTMLElement,
  value: string | Record<string, string | number>
): void {
  if (typeof value === 'string') {
    el.style.cssText = value
  } else if (value && typeof value === 'object') {
    el.style.cssText = ''
    Object.entries(value).forEach(([key, val]) => {
      if (val != null) {
        el.style[key] =
          typeof val === 'number' &&
          !/^(z|opacity|font-weight|line-height)/.test(key)
            ? `${val}px`
            : String(val)
      }
    })
  } else {
    el.style.cssText = ''
  }
}

// 添加事件监听器
export function addEventListener(
  el: HTMLElement,
  name: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions
): () => void {
  el.addEventListener(name, handler, options)
  return () => el.removeEventListener(name, handler, options)
}

// 移除事件监听器
export function removeEventListener(
  el: HTMLElement,
  name: string,
  handler: EventListener,
  options?: boolean | EventListenerOptions
): void {
  el.removeEventListener(name, handler, options)
}

// 动态内容插入（表达式处理）
export function insertExpression(
  parent: HTMLElement,
  expression: any,
  marker: Node | null = null,
  initial = true
): Node {
  // 创建或使用标记节点
  const end = marker || document.createComment('')
  if (initial && !marker) {
    parent.appendChild(end)
  }

  // 创建响应式效果
  useEffect(() => {
    const value = typeof expression === 'function' ? expression() : expression

    // 清除现有内容
    let node = end.previousSibling
    while (node && (node as any)._$markerOwner === end) {
      const prev = node.previousSibling
      node.remove()
      node = prev
    }

    // 处理不同类型的值
    if (value == null) {
      // 不插入任何内容
      return
    } else if (Array.isArray(value)) {
      // 插入数组内容
      const fragment = document.createDocumentFragment()
      value.forEach(item => {
        const node =
          item instanceof Node ? item : document.createTextNode(String(item))
        ;(node as any)._$markerOwner = end
        fragment.appendChild(node)
      })
      parent.insertBefore(fragment, end)
    } else if (value instanceof Node) {
      // 插入DOM节点
      ;(value as any)._$markerOwner = end
      parent.insertBefore(value, end)
    } else {
      // 插入文本内容
      const textNode = document.createTextNode(String(value))
      ;(textNode as any)._$markerOwner = end
      parent.insertBefore(textNode, end)
    }
  })

  return end
}

// 插入内容到元素
export function insert(
  parent: HTMLElement,
  content: any,
  anchor: Node | null = null
): void {
  if (content == null) return

  // 插入内容
  if (Array.isArray(content)) {
    const fragment = document.createDocumentFragment()
    content.forEach(item => {
      if (item instanceof Node) {
        fragment.appendChild(item)
      } else if (item != null) {
        fragment.appendChild(document.createTextNode(String(item)))
      }
    })

    parent.insertBefore(fragment, anchor)
  } else if (content instanceof Node) {
    parent.insertBefore(content, anchor)
  } else if (content != null) {
    parent.insertBefore(document.createTextNode(String(content)), anchor)
  }
}

// 展开属性
export function spread(el: HTMLElement, props: Record<string, any>): void {
  // 处理所有传入的属性
  for (const key in props) {
    if (key === 'children' || key === 'ref' || key === 'innerHTML') continue

    const value = props[key]

    if (key === 'style') {
      setStyle(el, value)
    } else if (key === 'classList' || key === 'class' || key === 'className') {
      setClassList(el, value)
    } else if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase()
      addEventListener(el, eventName, value)
    } else {
      setProperty(el, key, value)
    }
  }

  // 处理ref
  if ('ref' in props && props.ref) {
    useEffect(() => {
      if (typeof props.ref === 'function') {
        props.ref(el)
      } else if (props.ref && 'current' in props.ref) {
        props.ref.current = el
      }
    })
  }

  // 处理innerHTML
  if ('innerHTML' in props) {
    el.innerHTML = props.innerHTML
  }
}
