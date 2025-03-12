import { isArray } from '@zeus/shared'
import type { JSX } from './jsx'

// For 组件的 Props 类型
interface ForProps<T> {
  each: T[]
  fallback?: JSX.Element
  children: (item: T, index: number) => JSX.Element
}

// 创建 For 组件
export function For<T>(props: ForProps<T>): JSX.Element {
  if (!isArray(props.each)) {
    console.warn('For component expects an array')
    return props.fallback || null
  }

  // 创建 fragment
  const fragment = document.createDocumentFragment()

  // 遍历数组创建元素
  props.each.forEach((item, index) => {
    const element = props.children(item, index)
    fragment.appendChild(element)
  })

  return fragment
}

// Show 组件的 Props 类型
interface ShowProps {
  when: boolean
  fallback?: JSX.Element
  children: JSX.Element | (() => JSX.Element)
}

// 创建 Show 组件
export function Show(props: ShowProps): JSX.Element {
  if (!props.when) {
    return props.fallback || null
  }

  return typeof props.children === 'function'
    ? props.children()
    : props.children
}
