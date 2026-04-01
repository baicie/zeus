// ============================================================================
// @zeus-js/router - 入口文件
// ============================================================================

// History 工厂函数
export { createWebHistory } from './history/createWebHistory'
export { createHashHistory } from './history/createHashHistory'
export { createMemoryHistory } from './history/createMemoryHistory'
export type { BrowserHistoryOptions } from './history/createWebHistory'
export type { HashHistoryOptions } from './history/createHashHistory'
export type { MemoryHistoryOptions } from './history/createMemoryHistory'

// Router 工厂函数
export { createRouter } from './createRouter'

// 组件
export { RouterProvider } from './components/RouterProvider'
export { RouterView } from './components/RouterView'
export { RouterLink } from './components/RouterLink'

// 兼容性别名（vue-router 风格）
export { RouterView as View } from './components/RouterView'
export { RouterLink as Link } from './components/RouterLink'

// Hooks
export {
  useRouter,
  useRoute,
  useParams,
  useLocation,
  useNavigate,
  useIsRouting,
} from './hooks'

// 类型
export type {
  Router,
  RouterOptions,
  RouteRecordRaw,
  RouteRecordSingle,
  RouteRecordMultiple,
  RouteRecord,
  RouteLocationRaw,
  RouteLocationNormalized,
  RouteLocation,
  HistoryState,
  History,
  Params,
} from './types'

export type { RouterProviderProps } from './components/RouterProvider'

export type { RouterLinkProps } from './components/RouterLink'
