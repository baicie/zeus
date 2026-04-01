// ============================================================================
// @zeus-js/router - Router 工厂函数
// ============================================================================

import { signal } from '@zeus-js/core'

import type {
  RouteLocationNormalized,
  RouteLocationRaw,
  RouteRecord,
  RouteRecordRaw,
  Router,
  RouterOptions,
} from './types'

import { createRouteMatcher } from './routing'

// ============================================================================
// Router 创建
// ============================================================================

/**
 * 创建 Router
 *
 * @param options Router 选项
 * @returns Router 实例
 *
 * @example
 * ```typescript
 * const router = createRouter({
 *   history: createWebHistory(),
 *   routes: [
 *     { path: '/', component: Home },
 *     { path: '/users/:id', component: User }
 *   ]
 * })
 *
 * // 在 App 中使用
 * function App() {
 *   return (
 *     <RouterProvider router={router}>
 *       <RouterView />
 *     </RouterProvider>
 *   )
 * }
 * ```
 */
export function createRouter(options: RouterOptions): Router {
  const { history, routes } = options

  // 创建路由匹配器
  const matcher = createRouteMatcher(routes)

  // 当前路由 Signal
  const currentRoute = signal<RouteLocationNormalized>({
    fullPath: '/',
    path: '/',
    query: {},
    hash: '',
    params: {},
    matched: [],
  })

  // 监听 history 变化
  const stopHistoryListener = history.listen(_event => {
    const matched = matcher.matchRoute(history.location)
    if (matched) {
      currentRoute({
        fullPath: matched.path + history.location.split('?')[1] || '',
        path: matched.path,
        query: parseQuery(history.location),
        hash: extractHash(history.location),
        params: matched.params,
        matched: matched.matched,
      })
    }
  })

  // 初始化
  function init() {
    if (history.init) {
      history.init()
    }
    const matched = matcher.matchRoute(history.location)
    if (matched) {
      currentRoute({
        fullPath: matched.path,
        path: matched.path,
        query: parseQuery(history.location),
        hash: extractHash(history.location),
        params: matched.params,
        matched: matched.matched,
      })
    }
  }

  // 导航
  function push(to: RouteLocationRaw): void {
    const resolved = resolveTo(to)
    history.push(resolved.path)

    const matched = matcher.matchRoute(resolved.path)
    if (matched) {
      currentRoute({
        fullPath: resolved.path,
        path: matched.path,
        query: parseQuery(resolved.path),
        hash: resolved.hash || '',
        params: matched.params,
        matched: matched.matched,
      })
    }
  }

  function replace(to: RouteLocationRaw): void {
    const resolved = resolveTo(to)
    history.replace(resolved.path)

    const matched = matcher.matchRoute(resolved.path)
    if (matched) {
      currentRoute({
        fullPath: resolved.path,
        path: matched.path,
        query: parseQuery(resolved.path),
        hash: resolved.hash || '',
        params: matched.params,
        matched: matched.matched,
      })
    }
  }

  function go(delta: number): void {
    history.go(delta)
  }

  function back(): void {
    history.back()
  }

  function forward(): void {
    history.forward()
  }

  // 添加路由
  function addRoute(_parentName: string, _route: RouteRecordRaw): void {
    // TODO: 重新构建匹配器
  }

  // 获取所有路由
  function getRoutes(): RouteRecord[] {
    return matcher.routes as RouteRecord[]
  }

  // 根据 name 获取路由
  function getRoute(name: string): RouteRecord | undefined {
    return matcher.routes.find((r: any) => r.name === name) as
      | RouteRecord
      | undefined
  }

  // 解析路径
  function resolve(to: RouteLocationRaw): RouteLocationNormalized {
    const resolved = resolveTo(to)
    const matched = matcher.matchRoute(resolved.path) || {
      path: resolved.path,
      params: {},
      matched: [],
    }

    return {
      fullPath: resolved.path,
      path: matched.path,
      query: parseQuery(resolved.path),
      hash: resolved.hash || '',
      params: matched.params,
      matched: matched.matched,
      name: resolved.name,
    }
  }

  // 解析目标路径
  function resolveTo(to: RouteLocationRaw): {
    path: string
    hash?: string
    name?: string
    query?: Record<string, string | string[] | null>
  } {
    if (typeof to === 'string') {
      return { path: to }
    }
    return {
      path: to.path || '',
      hash: to.hash,
      name: to.name,
      query: to.query,
    }
  }

  // 清理
  function destroy() {
    stopHistoryListener()
    if (history.destroy) {
      history.destroy()
    }
  }

  return {
    get currentRoute() {
      return currentRoute as () => RouteLocationNormalized
    },
    get history() {
      return history
    },
    get routes() {
      return routes
    },
    push,
    replace,
    go,
    back,
    forward,
    addRoute,
    getRoutes,
    getRoute,
    resolve,
    init,
    destroy,
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 解析查询参数
 */
function parseQuery(url: string): Record<string, string | string[] | null> {
  const query: Record<string, string | string[] | null> = {}
  const idx = url.indexOf('?')
  if (idx === -1) return query

  const search = url.slice(idx + 1)
  if (!search) return query

  const hashIdx = search.indexOf('#')
  const queryStr = hashIdx > -1 ? search.slice(0, hashIdx) : search

  for (const pair of queryStr.split('&')) {
    const [key, value = ''] = pair.split('=')
    if (!key) continue

    const decodedKey = decodeURIComponent(key)
    const decodedValue = decodeURIComponent(value)

    if (query[decodedKey]) {
      if (Array.isArray(query[decodedKey])) {
        ;(query[decodedKey] as string[]).push(decodedValue)
      } else {
        query[decodedKey] = [query[decodedKey] as string, decodedValue]
      }
    } else {
      query[decodedKey] = decodedValue
    }
  }

  return query
}

/**
 * 提取 hash
 */
function extractHash(url: string): string {
  const idx = url.indexOf('#')
  return idx > -1 ? url.slice(idx + 1) : ''
}
