// ============================================================================
// @zeus-js/router - Hooks
// ============================================================================

import { useRouterContext } from './context'
import type {
  Params,
  RouteLocationNormalized,
  RouteLocationRaw,
  Router,
} from './types'

// ============================================================================
// Hooks
// ============================================================================

/**
 * 获取 router 实例
 *
 * @example
 * ```tsx
 * function Component() {
 *   const router = useRouter()
 *   return <button onClick={() => router.push('/home')}>Go Home</button>
 * }
 * ```
 */
export function useRouter(): Router {
  return useRouterContext()
}

/**
 * 获取当前路由
 *
 * @example
 * ```tsx
 * function User() {
 *   const route = useRoute()
 *   return <div>Path: {route.path}</div>
 * }
 * ```
 */
export function useRoute(): RouteLocationNormalized {
  return useRouter().currentRoute()
}

/**
 * 获取路由参数
 *
 * @example
 * ```tsx
 * function User() {
 *   const params = useParams<{ id: string }>()
 *   return <div>User ID: {params.id}</div>
 * }
 * ```
 */
export function useParams<T extends Params = Params>(): T {
  const route = useRoute()
  return route.params as T
}

/**
 * 获取 location
 *
 * @example
 * ```tsx
 * function Component() {
 *   const location = useLocation()
 *   return <div>Path: {location.path}</div>
 * }
 * ```
 */
export function useLocation(): RouteLocationNormalized {
  return useRoute()
}

/**
 * 获取 navigate 函数
 *
 * @example
 * ```tsx
 * function Component() {
 *   const navigate = useNavigate()
 *
 *   const handleClick = () => {
 *     navigate('/users')
 *   }
 *
 *   return <button onClick={handleClick}>Go</button>
 * }
 * ```
 */
export function useNavigate(): (
  to: RouteLocationRaw,
  options?: { replace?: boolean },
) => void {
  const router = useRouter()
  return (to: RouteLocationRaw, options?: { replace?: boolean }) => {
    if (options && options.replace) {
      router.replace(to)
    } else {
      router.push(to)
    }
  }
}

/**
 * 检查是否正在路由切换
 */
export function useIsRouting(): () => boolean {
  return () => {
    // TODO: 实现
    return false
  }
}
