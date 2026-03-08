// Navigation guard return types
export type NavigationGuardReturn =
  | void
  | Error
  | boolean
  | null
  | undefined
  | RouteLocationRaw

export interface NavigationGuardNext {
  (): void
  (error: Error): void
  (location: RouteLocationRaw): void
  (valid: boolean | null | undefined): void
}

export interface NavigationGuard {
  (
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    next: NavigationGuardNext,
  ): NavigationGuardReturn | Promise<NavigationGuardReturn>
}

export interface PostNavigationGuard {
  (
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    failure?: NavigationFailure,
  ): any
}

export type RouteParams = Record<string, string | string[]>
export type RouteParamsRaw = Record<
  string,
  string | number | (string | number)[]
>
export type RouteQuery = Record<string, string | string[] | null>

export interface RouteMeta extends Record<string | number | symbol, unknown> {}

export type RouteComponent = (props?: any) => unknown
export type Lazy<T> = () => Promise<T>
export type RawRouteComponent = RouteComponent | Lazy<RouteComponent>

export interface RouteLocationRaw {
  path?: string
  name?: string | symbol
  params?: RouteParamsRaw
  query?: RouteQuery
  hash?: string
  replace?: boolean
}

export interface RouteRecordBase {
  path: string
  name?: string | symbol
  meta?: RouteMeta
  beforeEnter?: NavigationGuard | NavigationGuard[]
  alias?: string | string[]
  redirect?:
    | RouteLocationRaw
    | string
    | ((to: RouteLocationNormalized) => RouteLocationRaw | string)
}

export interface RouteRecordSingleView extends RouteRecordBase {
  component: RawRouteComponent
  children?: RouteRecordRaw[]
}

export interface RouteRecordMultipleViews extends RouteRecordBase {
  components: Record<string, RawRouteComponent>
  children?: RouteRecordRaw[]
}

export interface RouteRecordRedirect extends RouteRecordBase {
  redirect: RouteRecordBase['redirect']
}

export type RouteRecordRaw =
  | RouteRecordSingleView
  | RouteRecordMultipleViews
  | RouteRecordRedirect

export interface RouteRecordNormalized {
  path: string
  name?: string | symbol
  meta: RouteMeta
  components: Record<string, RouteComponent>
  beforeEnter: NavigationGuard[]
  regex: RegExp
  keys: string[]
  children: RouteRecordNormalized[]
  redirect?: RouteRecordBase['redirect']
}

export interface RouteLocationNormalized {
  path: string
  fullPath: string
  hash: string
  query: RouteQuery
  params: RouteParams
  name?: string | symbol
  matched: RouteRecordNormalized[]
  meta: RouteMeta
  redirectedFrom?: RouteLocationNormalized
}

export interface RouterHistory {
  readonly base: string
  readonly location: string
  push(to: string, data?: any): void
  replace(to: string, data?: any): void
  go(delta: number): void
  listen(
    callback: (to: string, from: string, info: HistoryStateInfo) => void,
  ): () => void
  createHref(location: string): string
  destroy(): void
}

export interface HistoryStateInfo {
  direction: 'back' | 'forward' | ''
  delta: number
}

export interface NavigationFailure extends Error {
  type: 'aborted' | 'cancelled' | 'duplicated' | 'redirected'
  from: RouteLocationNormalized
  to: RouteLocationNormalized
}

export interface ScrollBehavior {
  (
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    savedPosition: ScrollToOptions | null,
  ): ScrollToOptions | void | false | Promise<ScrollToOptions | void | false>
}

export interface RouterOptions {
  history: RouterHistory
  routes: RouteRecordRaw[]
  scrollBehavior?: ScrollBehavior
  linkActiveClass?: string
  linkExactActiveClass?: string
  strict?: boolean
  sensitive?: boolean
}

export interface Router {
  readonly currentRoute: RouteLocationNormalized
  readonly options: RouterOptions
  push(to: RouteLocationRaw | string): Promise<NavigationFailure | void>
  replace(to: RouteLocationRaw | string): Promise<NavigationFailure | void>
  go(delta: number): void
  back(): void
  forward(): void
  beforeEach(guard: NavigationGuard): () => void
  afterEach(guard: PostNavigationGuard): () => void
  beforeResolve(guard: NavigationGuard): () => void
  onError(
    handler: (
      error: any,
      to: RouteLocationNormalized,
      from: RouteLocationNormalized,
    ) => any,
  ): () => void
  resolve(to: RouteLocationRaw | string): RouteLocationNormalized
  addRoute(record: RouteRecordRaw): () => void
  removeRoute(name: string | symbol): void
  hasRoute(name: string | symbol): boolean
  getRoutes(): RouteRecordNormalized[]
  install(app: any): void
}

export interface RouterLinkProps {
  to: RouteLocationRaw | string
  replace?: boolean
  activeClass?: string
  exactActiveClass?: string
  ariaCurrentValue?: string
}

export interface RouterViewProps {
  name?: string
}
