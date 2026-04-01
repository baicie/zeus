// ============================================================================
// @zeus-js/router - Context 定义
// ============================================================================

import { createContext, useContext } from '@zeus-js/core'
import type { Context } from '@zeus-js/core'

// ============================================================================
// Context 创建
// ============================================================================

/** Router Context */
export const RouterContext: Context<any> = createContext<any>(null)

/** Route Context */
export const RouteContext: Context<any> = createContext<any>(null)

// ============================================================================
// Context 使用
// ============================================================================

/**
 * 获取 Router Context
 * @throws 如果不在 Router 组件内调用
 */
export function useRouterContext(): any {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error(
      '[Router] useRouterContext() must be used within a Router component',
    )
  }
  return context
}

/**
 * 获取 Route Context
 */
export function useRouteContext(): any | undefined {
  return useContext(RouteContext)
}
