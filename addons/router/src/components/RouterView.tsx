// ============================================================================
// @zeus-js/router - RouterView 组件
// ============================================================================

import { computed } from '@zeus-js/core'
import type { JSXElement } from '@zeus-js/core'

import { useRouteContext, useRouterContext } from '../context'

// ============================================================================
// RouterView
// ============================================================================

/**
 * RouterView 组件
 *
 * 渲染当前匹配的路由组件
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <RouterProvider router={router}>
 *       <RouterView />
 *     </RouterProvider>
 *   )
 * }
 * ```
 */
export function RouterView(): JSXElement {
  const router = useRouterContext()
  const parentRoute = useRouteContext()

  // 当前匹配的路由
  const matchedRoute = computed(() => {
    const current = router.currentRoute()
    if (!current.matched || current.matched.length === 0) {
      return null
    }

    // 如果有父路由，找到当前嵌套层级的路由
    if (parentRoute) {
      const parentPath =
        (parentRoute as any).path || (parentRoute as any).pattern
      const parentIndex = current.matched.findIndex(
        (m: any) => (m.path || (m as any).pattern) === parentPath,
      )
      if (parentIndex > -1 && current.matched[parentIndex + 1]) {
        return current.matched[parentIndex + 1]
      }
      return null
    }

    // 根路由
    return current.matched[0]
  })

  // 渲染组件
  const component = computed(() => {
    const route = matchedRoute()
    if (!route) {
      return null
    }

    // 获取组件
    const comp = (route as any).components
      ? (route as any).components.default
      : (route as any).component
    if (!comp) {
      return null
    }

    return comp
  })

  // 获取组件 props
  const routeProps = computed(() => {
    const current = router.currentRoute()
    return {
      params: current.params,
      location: {
        pathname: current.path,
        search: current.fullPath.split('?')[1] || '',
        hash: current.hash,
        query: current.query,
      },
    }
  })

  // 渲染
  const comp = component()
  if (!comp) {
    return null as unknown as JSXElement
  }

  return comp(routeProps()) as JSXElement
}
