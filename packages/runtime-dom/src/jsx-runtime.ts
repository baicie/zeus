// import { untrack } from '@zeus-js/reactivity'
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
