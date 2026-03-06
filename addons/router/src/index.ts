export { createRouter } from './router'
export {
  createWebHistory,
  createWebHashHistory,
  createMemoryHistory,
} from './history'
export { RouterView } from './RouterView'
export { RouterLink } from './RouterLink'
export { useRouter, useRoute } from './composables'

export type {
  Router,
  RouterOptions,
  RouterHistory,
  RouteRecordRaw,
  RouteRecordSingleView,
  RouteRecordMultipleViews,
  RouteRecordNormalized,
  RouteLocationRaw,
  RouteLocationNormalized,
  RouteParams,
  RouteParamsRaw,
  RouteQuery,
  RouteMeta,
  RouteComponent,
  RawRouteComponent,
  NavigationGuard,
  NavigationGuardNext,
  NavigationGuardReturn,
  PostNavigationGuard,
  NavigationFailure,
  ScrollBehavior,
  RouterLinkProps,
  RouterViewProps,
  HistoryStateInfo,
} from './types'
