import { type Getter, useRenderEffect } from '@zeus-js/reactivity'
import { createComponent } from '@zeus-js/runtime-core'
import { createElement, spread } from './primitives/elements'
const builtInComponents = new Map()

function untrack(children: any) {}
// Fragment组件
export const Fragment: unique symbol = Symbol('Fragment')

// JSX转换函数
export function jsx(type: any, props: any): any {
  // 处理空props
  props = props || {}

  // 处理Fragment
  if (type === Fragment) {
    const fragment = document.createDocumentFragment()
    if (props.children) {
      appendChildren(fragment, props.children)
    }
    return fragment
  }

  // 处理函数组件
  if (typeof type === 'function') {
    return createComponent(type, props)
  }

  // 处理内置组件
  if (typeof type === 'string' && builtInComponents.has(type)) {
    const Component = builtInComponents.get(type)
    return createComponent(Component, props)
  }

  // 处理DOM元素
  const element = createElement(type)

  // 设置属性
  for (const key in props) {
    if (key === 'children') continue

    // 处理ref
    if (key === 'ref' && props.ref) {
      if (typeof props.ref === 'function') {
        props.ref(element)
      } else if (props.ref && 'current' in props.ref) {
        props.ref.current = element
      }
      continue
    }

    // 展开其他属性
    spread(element, { [key]: props[key] })
  }

  // 添加子元素
  if (props.children) {
    appendChildren(element, props.children)
  }

  return element
}

// 辅助函数：追加子元素
function appendChildren(parent: Node, children: any) {
  if (children == null) return

  if (Array.isArray(children)) {
    children.forEach(child => appendChildren(parent, child))
  } else if (typeof children === 'string' || typeof children === 'number') {
    parent.appendChild(document.createTextNode(String(children)))
  } else if (children instanceof Node) {
    parent.appendChild(children)
  } else if (typeof children === 'function') {
    // 处理响应式函数
    const result = untrack(children)
    appendChildren(parent, result)
  } else if (children === false || children === true) {
    // 忽略布尔值
  } else {
    // 处理其他类型
    parent.appendChild(document.createTextNode(String(children)))
  }
}

// 支持多个子元素的JSX转换函数
export function jsxs(type: any, props: any): any {
  return jsx(type, props)
}

export function insert(
  parent: Element,
  accessor?: Getter<unknown>,
  marker?: Node,
  initial?: unknown[]
): void {
  if (marker !== undefined && !initial) initial = []
  if (typeof accessor !== 'function')
    return insertExpression(parent, accessor, initial, marker)
  useRenderEffect(
    current => insertExpression(parent, accessor(), current, marker),
    initial
  )
}

type MaybeArray<T> = T | T[]
function insertExpression(
  parent: Element,
  value: any,
  current: MaybeArray<any>,
  marker?: Node,
  unwrapArray?: unknown[]
) {
  while (typeof current === 'function') current = current()
  if (value === current) return current
  const t = typeof value,
    multi = marker !== undefined
  parent =
    (multi && Array.isArray(current) && current[0] && current[0].parentNode) ||
    parent

  if (t === 'string' || t === 'number') {
    if (t === 'number') {
      value = value.toString()
      if (value === current) return current
    }
    if (multi) {
      let node = current[0]
      if (node && node.nodeType === 3) {
        node.data !== value && (node.data = value)
        // eslint-disable-next-line no-restricted-globals
      } else node = document.createTextNode(value)
      current = cleanChildren(parent, current, marker, node)
    } else {
      if (current !== '' && typeof current === 'string' && parent.firstChild) {
        current = parent.firstChild.data = value
      } else current = parent.textContent = value
    }
  } else if (value == null || t === 'boolean') {
    current = cleanChildren(parent, current, marker)
  } else if (t === 'function') {
    useRenderEffect(() => {
      let v = value()
      while (typeof v === 'function') v = v()
      current = insertExpression(parent, v, current, marker)
    })
    return () => current
  } else if (Array.isArray(value)) {
    const array = []
    const currentArray = current && Array.isArray(current)
    if (normalizeIncomingArray(array, value, current, unwrapArray)) {
      useRenderEffect(
        () => (current = insertExpression(parent, array, current, marker, true))
      )
      return () => current
    }

    if (array.length === 0) {
      current = cleanChildren(parent, current, marker)
      if (multi) return current
    } else if (currentArray) {
      if (current.length === 0) {
        appendNodes(parent, array, marker)
      } else reconcileArrays(parent, current, array)
    } else {
      current && cleanChildren(parent)
      appendNodes(parent, array)
    }
    current = array
  } else if (value.nodeType) {
    if (Array.isArray(current)) {
      if (multi)
        return (current = cleanChildren(parent, current, marker, value))
      cleanChildren(parent, current, null, value)
    } else if (current == null || current === '' || !parent.firstChild) {
      parent.appendChild(value)
    } else parent.replaceChild(value, parent.firstChild)
    current = value
  }
  return current
}

function cleanChildren(
  parent: Element,
  current?: MaybeArray<Node>,
  marker?: Node,
  replacement?: Node
) {
  if (marker === undefined) return (parent.textContent = '')
  // eslint-disable-next-line no-restricted-globals
  const node = replacement || document.createTextNode('')
  if (Array.isArray(current)) {
    let inserted = false
    for (let i = current.length - 1; i >= 0; i--) {
      const el = current[i]
      if (node !== el) {
        const isParent = el.parentNode === parent
        if (!inserted && !i)
          isParent
            ? parent.replaceChild(node, el)
            : parent.insertBefore(node, marker)
        else isParent && el.remove()
      } else inserted = true
    }
  } else parent.insertBefore(node, marker)
  return [node]
}

function appendNodes(parent: Element, array: Node[], marker = null) {
  for (let i = 0, len = array.length; i < len; i++)
    parent.insertBefore(array[i], marker)
}

function reconcileArrays(parentNode: Node, a: Node[], b: Node[]) {
  let bLength = b.length,
    aEnd = a.length,
    bEnd = bLength,
    aStart = 0,
    bStart = 0,
    after = a[aEnd - 1].nextSibling,
    map = null

  while (aStart < aEnd || bStart < bEnd) {
    // common prefix
    if (a[aStart] === b[bStart]) {
      aStart++
      bStart++
      continue
    }
    // common suffix
    while (a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--
      bEnd--
    }
    // append
    if (aEnd === aStart) {
      const node =
        bEnd < bLength
          ? bStart
            ? b[bStart - 1].nextSibling
            : b[bEnd - bStart]
          : after

      while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node)
      // remove
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart])) a[aStart].remove()
        aStart++
      }
      // swap backward
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      const node = a[--aEnd].nextSibling
      parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling)
      parentNode.insertBefore(b[--bEnd], node)

      a[aEnd] = b[bEnd]
      // fallback to map
    } else {
      if (!map) {
        map = new Map()
        let i = bStart

        while (i < bEnd) map.set(b[i], i++)
      }

      const index = map.get(a[aStart])
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart,
            sequence = 1,
            t

          while (++i < aEnd && i < bEnd) {
            if ((t = map.get(a[i])) == null || t !== index + sequence) break
            sequence++
          }

          if (sequence > index - bStart) {
            const node = a[aStart]
            while (bStart < index) parentNode.insertBefore(b[bStart++], node)
          } else parentNode.replaceChild(b[bStart++], a[aStart++])
        } else aStart++
      } else a[aStart++].remove()
    }
  }
}

function normalizeIncomingArray(
  normalized: Node[],
  array: any[],
  current: Node[],
  unwrap?: boolean
): any {
  let dynamic = false
  for (let i = 0, len = array.length; i < len; i++) {
    let item = array[i],
      prev = current && current[normalized.length],
      t
    if (item == null || item === true || item === false) {
      // matches null, undefined, true or false
      // skip
    } else if ((t = typeof item) === 'object' && item.nodeType) {
      normalized.push(item)
    } else if (Array.isArray(item)) {
      dynamic = normalizeIncomingArray(normalized, item, prev) || dynamic
    } else if (t === 'function') {
      if (unwrap) {
        while (typeof item === 'function') item = item()
        dynamic =
          normalizeIncomingArray(
            normalized,
            Array.isArray(item) ? item : [item],
            Array.isArray(prev) ? prev : [prev]
          ) || dynamic
      } else {
        normalized.push(item)
        dynamic = true
      }
    } else {
      const value = String(item)
      if (prev && prev.nodeType === 3 && prev.data === value)
        normalized.push(prev)
      else normalized.push(document.createTextNode(value))
    }
  }
  return dynamic
}
