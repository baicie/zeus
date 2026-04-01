// ============================================================================
// @zeus-js/router - RouterLink 组件
// ============================================================================

import { computed } from '@zeus-js/core'
import type { JSXElement } from '@zeus-js/core'

import { useRouterContext } from '../context'
import type { RouteLocationRaw } from '../types'

// ============================================================================
// Props
// ============================================================================

export interface RouterLinkProps {
  /** 链接目标 */
  to: RouteLocationRaw
  /** 替换历史记录 */
  replace?: boolean
  /** 自定义标签 */
  tag?: string
  /** 自定义类名 */
  class?: string
  /** 激活状态类名 */
  activeClass?: string
  /** 完全匹配激活类名 */
  exactActiveClass?: string
  /** 子元素 */
  children?: JSXElement
}

// ============================================================================
// RouterLink
// ============================================================================

/**
 * RouterLink 组件
 *
 * 支持编程式导航的链接组件
 *
 * @example
 * ```tsx
 * // 字符串形式
 * <RouterLink to="/users">Users</RouterLink>
 *
 * // 对象形式
 * <RouterLink to={{ path: '/users', query: { page: 1 } }}>Users</RouterLink>
 * ```
 */
export function RouterLink(props: RouterLinkProps): JSXElement {
  const router = useRouterContext()

  // 解析目标路径
  const toPath = computed(() => {
    if (typeof props.to === 'string') {
      return props.to
    }
    let path = props.to.path || ''
    if (props.to.query) {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(props.to.query)) {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            for (const v of value) {
              query.append(key, v)
            }
          } else {
            query.set(key, value)
          }
        }
      }
      const queryStr = query.toString()
      if (queryStr) {
        path += '?' + queryStr
      }
    }
    if (props.to.hash) {
      path += '#' + props.to.hash
    }
    return path
  })

  // 检查激活状态
  const isActive = computed(() => {
    const current = router.currentRoute()
    return current.path.startsWith(toPath())
  })

  const isExactActive = computed(() => {
    const current = router.currentRoute()
    return current.path === toPath()
  })

  // 计算类名
  const className = computed(() => {
    const classes = [props.class].filter(Boolean)

    if (isExactActive() && props.exactActiveClass) {
      classes.push(props.exactActiveClass)
    } else if (isActive() && props.activeClass) {
      classes.push(props.activeClass)
    }

    return classes.join(' ') || undefined
  })

  // 点击处理
  const handleClick = (e: MouseEvent) => {
    // 忽略外部链接、修饰键点击等
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey
    ) {
      return
    }

    e.preventDefault()

    // 导航
    if (props.replace) {
      router.replace(props.to)
    } else {
      router.push(props.to)
    }
  }

  const Tag = (props.tag as any) || 'a'

  return (
    <Tag href={toPath()} class={className()} onClick={handleClick}>
      {props.children}
    </Tag>
  )
}
