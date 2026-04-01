// ============================================================================
// @zeus-js/router - RouterProvider 组件
// ============================================================================

import type { JSXElement } from '@zeus-js/core'

import { RouterContext } from '../context'
import type { Router } from '../types'

// ============================================================================
// Props
// ============================================================================

export interface RouterProviderProps {
  /** Router 实例 */
  router: Router
  /** 子元素 */
  children?: JSXElement
}

// ============================================================================
// RouterProvider
// ============================================================================

/**
 * RouterProvider 组件
 *
 * 将 Router 实例注入到 Context 中
 *
 * @example
 * ```tsx
 * const router = createRouter({ ... })
 *
 * function App() {
 *   return (
 *     <RouterProvider router={router}>
 *       <Layout />
 *     </RouterProvider>
 *   )
 * }
 * ```
 */
export function RouterProvider(props: RouterProviderProps): JSXElement {
  return (
    <RouterContext.Provider value={props.router}>
      {props.children}
    </RouterContext.Provider>
  )
}
