import { effect } from '@zeus-js/signal'
import { isRef } from '@zeus-js/runtime-core'

// =============================================================================
// template(html) — Creates a cached template element, returns a clone function
// =============================================================================
export function template(html: string): () => Node {
  let tpl: HTMLTemplateElement | undefined
  return () => {
    if (!tpl) {
      tpl = document.createElement('template')
      tpl.innerHTML = html
    }
    return tpl.content.firstChild!.cloneNode(true)
  }
}

// =============================================================================
// insert(parent, accessor, marker?) — Insert static or reactive content into DOM
// =============================================================================
export function insert(
  parent: Node,
  accessor: any,
  marker?: Node | null,
): void {
  if (typeof accessor === 'function') {
    // 使用空数组作为初始值，与 SolidJS 思路一致
    // 这样在处理数组类型值的更新时更高效，避免 null -> array 的类型转换开销
    let current: Node | Node[] = []
    effect(() => {
      const value = accessor()
      current = insertValue(parent, value, current, marker ?? null) as
        | Node
        | Node[]
    })
  } else {
    insertValue(parent, accessor, null, marker ?? null)
  }
}

function insertValue(
  parent: Node,
  value: any,
  current: Node | Node[] | null,
  marker: Node | null,
): Node | Node[] | null {
  // 处理 current 清理：支持数组和单节点
  // 使用空数组 [] 作为初始值，与 SolidJS 思路一致
  if (current != null) {
    if (Array.isArray(current)) {
      for (const node of current) {
        if (node.parentNode) {
          node.parentNode.removeChild(node)
        }
      }
    } else {
      if (current.parentNode) {
        current.parentNode.removeChild(current)
      }
    }
  }

  // 如果 marker 已经不在 parent 下面（例如外部手动移动/删除了节点），
  // 退化为追加到末尾，避免 insertBefore 抛出 NotFoundError。
  if (marker && marker.parentNode !== parent) {
    marker = null
  }

  if (value == null || typeof value === 'boolean') {
    return null
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const textNode = document.createTextNode(String(value))
    parent.insertBefore(textNode, marker)
    return textNode
  }

  if (value instanceof Node) {
    parent.insertBefore(value, marker)
    return value
  }

  if (Array.isArray(value)) {
    const nodes: Node[] = []
    for (const item of value) {
      if (item instanceof Node) {
        parent.insertBefore(item, marker)
        nodes.push(item)
      } else if (item != null && typeof item !== 'boolean') {
        const tn = document.createTextNode(String(item))
        parent.insertBefore(tn, marker)
        nodes.push(tn)
      }
    }
    return nodes
  }

  return null
}

// =============================================================================
// delegateEvents(eventNames) — Set up event delegation on document
// =============================================================================
const delegatedEvents = new Set<string>()

export function delegateEvents(eventNames: string[]): void {
  for (const name of eventNames) {
    if (!delegatedEvents.has(name)) {
      delegatedEvents.add(name)
      document.addEventListener(name, eventHandler)
    }
  }
}

function eventHandler(e: Event): void {
  const key = `$$${e.type}`
  let node = e.target as any
  while (node !== null) {
    const handler = node[key]
    if (handler) {
      if (Array.isArray(handler)) {
        handler[0](handler[1], e)
      } else {
        handler(e)
      }
    }
    node = node.parentNode
  }
}

// =============================================================================
// DOM property/attribute helpers
// =============================================================================
export function addEventListener(
  node: Element,
  name: string,
  handler: EventListener,
  delegate?: boolean,
): void {
  if (delegate) {
    ;(node as any)[`$$${name}`] = handler
  } else {
    node.addEventListener(name, handler)
  }
}

export function setAttribute(node: Element, name: string, value: any): void {
  if (value == null || value === false) {
    node.removeAttribute(name)
  } else {
    node.setAttribute(name, value === true ? '' : String(value))
  }
}

export function setProperty(node: Element, name: string, value: any): void {
  ;(node as any)[name] = value
}

export function className(node: Element, value: string | (() => string)): void {
  if (typeof value === 'function') {
    effect(() => {
      node.className = value()
    })
  } else {
    node.className = value
  }
}

export function style(
  node: HTMLElement,
  value:
    | string
    | Record<string, string>
    | (() => string | Record<string, string>),
): void {
  if (typeof value === 'function') {
    effect(() => {
      applyStyle(node, value())
    })
  } else {
    applyStyle(node, value)
  }
}

function applyStyle(
  node: HTMLElement,
  value: string | Record<string, string>,
): void {
  if (typeof value === 'string') {
    node.style.cssText = value
  } else {
    for (const [k, v] of Object.entries(value)) {
      node.style.setProperty(k, v)
    }
  }
}

export function spread(
  node: Element,
  accessor: Record<string, any> | (() => Record<string, any>),
): void {
  const applyProps = (props: Record<string, any>) => {
    for (let [key, value] of Object.entries(props)) {
      if (key === 'class' || key === 'className') {
        className(node, value)
      } else if (key === 'style') {
        style(node as HTMLElement, value)
      } else if (key.startsWith('on')) {
        const eventName = key.slice(2).toLowerCase()
        addEventListener(node, eventName, value)
      } else if (key === 'ref') {
        if (isRef(value)) {
          value = node
        }
      } else {
        setAttribute(node, key, value)
      }
    }
  }

  if (typeof accessor === 'function') {
    effect(() => applyProps(accessor()))
  } else {
    applyProps(accessor)
  }
}
