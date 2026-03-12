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
        ref(node, value)
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

// =============================================================================
// ref(node, refValue) — Handle DOM ref assignment
// Supports both callback refs (function) and object refs
// =============================================================================
export function ref(node: Element, refValue: any): void {
  if (typeof refValue === 'function') {
    // Callback ref - call the function with the DOM element
    refValue(node)
  } else if (refValue && typeof refValue === 'object') {
    // Object ref (e.g., useRef) - assign to .value property
    refValue.value = node
  }
}

// =============================================================================
// reconcileArray - Efficient list rendering with key-based diff algorithm
// Minimizes DOM operations by only adding, removing, or moving necessary nodes
// =============================================================================

export interface ReconcileItem<T> {
  key: string | number
  data: T
}

export interface ReconcileOptions<T> {
  key: string | number | ((item: T, index: number) => string | number)
  onRemove?: (node: Node, index: number) => void
  onMove?: (node: Node, fromIndex: number, toIndex: number) => void
}

interface KeyedNode {
  key: string | number
  node: Node
}

function getKey<T>(item: T, index: number, keyFn: (item: T, index: number) => string | number): string | number {
  if (typeof keyFn === 'function') {
    return keyFn(item, index)
  }
  // If key is a property name
  const key = (item as any)[keyFn]
  return key !== undefined ? key : index
}

/**
 * Reconcile array items with key-based diffing
 * This is the core function for efficient list rendering
 *
 * @param parent - Parent DOM element
 * @param currentNodes - Current array of DOM nodes
 * @param items - New array of data items to render
 * @param renderItem - Function to render a single item into a DOM node
 * @param options - Options including key function and callbacks
 * @returns New array of DOM nodes
 */
export function reconcileArray<T>(
  parent: Node,
  currentNodes: Node[],
  items: T[],
  renderItem: (item: T, index: number) => Node,
  options: ReconcileOptions<T>,
): Node[] {
  const keyFn = typeof options.key === 'function'
    ? options.key
    : (item: T, index: number) => getKey(item, index, options.key as string | number)

  // Build key -> node map from current nodes
  const currentKeyedNodes: Map<string | number, KeyedNode> = new Map()
  for (let i = 0; i < currentNodes.length; i++) {
    const key = (currentNodes[i] as any).__zeus_key__
    if (key !== undefined) {
      currentKeyedNodes.set(key, { key, node: currentNodes[i] })
    }
  }

  const newNodes: Node[] = []
  const processedKeys = new Set<string | number>()

  // Track the last inserted node for efficient insertion position
  let lastNode: Node | null = null

  // First pass: process items in order
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const key = keyFn(item, i)

    processedKeys.add(key)

    const existing = currentKeyedNodes.get(key)

    if (existing) {
      // Key exists - reuse the node
      newNodes.push(existing.node)
      // Store key on node for future reconciliation
      ;(existing.node as any).__zeus_key__ = key
      lastNode = existing.node
    } else {
      // New item - render it
      const newNode = renderItem(item, i)
      ;(newNode as any).__zeus_key__ = key
      newNodes.push(newNode)
      lastNode = newNode
    }
  }

  // Second pass: remove nodes that are no longer in the list
  const nodesToRemove: Node[] = []
  for (let i = 0; i < currentNodes.length; i++) {
    const node = currentNodes[i]
    const key = (node as any).__zeus_key__

    if (key !== undefined && !processedKeys.has(key)) {
      nodesToRemove.push(node)
    }
  }

  // Perform DOM operations
  // Remove old nodes
  for (const node of nodesToRemove) {
    if (options.onRemove) {
      options.onRemove(node, currentNodes.indexOf(node))
    }
    if (node.parentNode === parent) {
      parent.removeChild(node)
    }
  }

  // Build final node array and reorder if needed
  // Reuse existing nodes in correct positions
  const finalNodes: Node[] = []
  let currentIndex = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const key = keyFn(item, i)
    const existing = currentKeyedNodes.get(key)

    if (existing) {
      // Node exists, ensure it's in correct position
      const targetPosition = finalNodes.length
      if (currentIndex !== targetPosition) {
        // Need to move node
        if (options.onMove) {
          options.onMove(existing.node, currentIndex, targetPosition)
        }
        // Insert at correct position
        const nextNode = parent.childNodes[targetPosition]
        if (nextNode && nextNode !== existing.node) {
          parent.insertBefore(existing.node, nextNode)
        } else if (!existing.node.nextSibling && parent.lastChild !== existing.node) {
          // Move to end
          parent.appendChild(existing.node)
        }
      }
      finalNodes.push(existing.node)
    } else {
      // New node - insert at end
      const newNode = newNodes[i]
      parent.appendChild(newNode)
      finalNodes.push(newNode)
    }
    currentIndex++
  }

  return finalNodes
}

/**
 * Simple keyed list rendering helper
 * Creates a reactive list that efficiently updates when the data changes
 *
 * @param parent - Parent DOM element
 * @param itemsAccessor - Function that returns the array of items
 * @param renderItem - Function to render each item
 * @param key - Key function or property name for item identity
 */
export function keyed<T>(
  parent: Node,
  itemsAccessor: () => T[],
  renderItem: (item: T, index: number) => Node,
  key: string | number | ((item: T, index: number) => string | number),
): () => void {
  let currentNodes: Node[] = []

  const reconcile = effect(function () {
    const items = itemsAccessor()

    currentNodes = reconcileArray(
      parent,
      currentNodes,
      items,
      renderItem,
      { key },
    )
  })

  return function cleanup() {
    reconcile()
  }
}
