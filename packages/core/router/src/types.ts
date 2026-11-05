import type { JSXValue } from '@zeus-js/runtime-dom'
import type { Accessor } from '@zeus-js/signal'

/** Route params merged from the matched route chain. */
export type ZeusParams = Readonly<Record<string, string | undefined>>

/** Immutable data produced by loaders/actions, keyed by route id. */
export type ZeusRouteData = Readonly<Record<string, unknown>>

/** A URL location as exposed by the router. */
export interface ZeusLocation {
  readonly pathname: string
  readonly search: string
  readonly hash: string
  readonly state?: unknown
  readonly key?: string
}

/** A navigation target: a URL string or a partial location. */
export type ZeusTo =
  | string
  | {
      readonly pathname?: string
      readonly search?: string
      readonly hash?: string
    }

/** A route element. Route components receive no props; they use hooks. */
export type ZeusRouteComponent = (props: Record<string, unknown>) => JSXValue

export interface ZeusLoaderFunctionArgs {
  readonly request: Request
  readonly params: ZeusParams
}

export type ZeusLoaderFunction = (args: ZeusLoaderFunctionArgs) => unknown

export type ZeusActionFunction = (args: ZeusLoaderFunctionArgs) => unknown

export interface ZeusShouldRevalidateFunctionArgs {
  readonly currentUrl: URL
  readonly nextUrl: URL
  readonly formMethod?: string
  readonly actionResult?: unknown
}

export type ZeusShouldRevalidateFunction = (
  args: ZeusShouldRevalidateFunctionArgs,
) => boolean

/**
 * Public route definition. `element` / `errorElement` are Zeus component
 * layer metadata; the router engine keeps unknown route fields intact.
 */
export interface ZeusRouteObject {
  id?: string
  path?: string
  index?: boolean
  caseSensitive?: boolean
  children?: ZeusRouteObject[]
  loader?: ZeusLoaderFunction
  action?: ZeusActionFunction
  shouldRevalidate?: ZeusShouldRevalidateFunction
  hasErrorBoundary?: boolean
  handle?: unknown
  element?: ZeusRouteComponent
  errorElement?: ZeusRouteComponent
  lazy?: () => Promise<unknown>
}

/** A matched route after the router has resolved its id. */
export interface ZeusDataRoute {
  readonly id: string
  readonly path?: string
  readonly index?: boolean
  readonly caseSensitive?: boolean
  readonly hasErrorBoundary?: boolean
  readonly handle?: unknown
  readonly element?: ZeusRouteComponent
  readonly errorElement?: ZeusRouteComponent
}

export interface ZeusRouteMatch {
  readonly params: ZeusParams
  readonly pathname: string
  readonly pathnameBase: string
  readonly route: ZeusDataRoute
}

export interface ZeusIdleNavigation {
  readonly state: 'idle'
  readonly location: undefined
  readonly formMethod: undefined
  readonly formAction: undefined
  readonly formData: undefined
}

export interface ZeusActiveNavigation {
  readonly state: 'loading' | 'submitting'
  readonly location: ZeusLocation
  readonly formMethod: string | undefined
  readonly formAction: string | undefined
  readonly formData: FormData | undefined
}

export type ZeusNavigation = ZeusIdleNavigation | ZeusActiveNavigation

export interface ZeusFetcher<T = unknown> {
  readonly state: 'idle' | 'loading' | 'submitting'
  readonly data: T | undefined
  readonly formMethod: string | undefined
  readonly formAction: string | undefined
  readonly formData: FormData | undefined
}

/** Data accepted by `fetcher.submit()`. */
export type ZeusFetcherSubmitData =
  | FormData
  | URLSearchParams
  | Readonly<Record<string, string | number | boolean | null | undefined>>
  | null

export interface ZeusFetcherLoadOptions {
  /** Route that owns the fetcher; defaults to the current route. */
  routeId?: string
}

export interface ZeusFetcherSubmitOptions {
  /** Form method; defaults to `get`. */
  method?: string
  /** Action URL; defaults to the current location. */
  action?: ZeusTo
  /** Route that owns the fetcher; defaults to the current route. */
  routeId?: string
  preventScrollReset?: boolean
}

/**
 * Zeus-owned fetcher handle. Its internal fetcher key stays private; read
 * state through the accessors.
 */
export interface ZeusFetcherHandle<T = unknown> {
  state(): ZeusFetcher<T>['state']
  data(): T | undefined
  formMethod(): string | undefined
  formAction(): string | undefined
  formData(): FormData | undefined
  load(href: ZeusTo, options?: ZeusFetcherLoadOptions): void
  submit(data: ZeusFetcherSubmitData, options?: ZeusFetcherSubmitOptions): void
  /** Aborts the active request and removes the fetcher. */
  cancel(): void
}

export type ZeusRevalidationState = 'idle' | 'loading'

export interface ZeusRouterSnapshot {
  readonly location: ZeusLocation
  readonly matches: ZeusRouteMatch[]
  readonly navigation: ZeusNavigation
  readonly revalidation: ZeusRevalidationState
  readonly loaderData: ZeusRouteData
  readonly actionData: ZeusRouteData | null
  readonly errors: ZeusRouteData | null
  readonly fetchers: ReadonlyMap<string, ZeusFetcher>
  readonly initialized: boolean
}

export interface ZeusNavigateOptions {
  replace?: boolean
  state?: unknown
  fromRouteId?: string
  relative?: 'route' | 'path'
  preventScrollReset?: boolean
  flushSync?: boolean
  viewTransition?: boolean
  formMethod?: string
  formData?: FormData
  body?: unknown
}

export interface ZeusRouterAccessors {
  readonly state: Accessor<ZeusRouterSnapshot>
  location(): ZeusLocation
  pathname(): string
  search(): string
  hash(): string
  matches(): ZeusRouteMatch[]
  params(): ZeusParams
  loaderData(): ZeusRouteData
  actionData(): ZeusRouteData | null
  errors(): ZeusRouteData | null
  navigation(): ZeusNavigation
  revalidation(): ZeusRevalidationState
  initialized(): boolean
  fetchers(): ReadonlyMap<string, ZeusFetcher>
}

/**
 * Zeus-owned router handle. The underlying `@remix-run/router` engine and its
 * state types are implementation details and never part of this contract.
 */
export interface ZeusRouter extends ZeusRouterAccessors {
  navigate(to: ZeusTo | number, options?: ZeusNavigateOptions): Promise<void>
  createHref(to: ZeusTo): string
  revalidate(): void
  /** Preload a target route's loader data without changing the current URL. */
  preload(to: ZeusTo, options?: { routeId?: string }): Promise<void>
  dispose(): void
}

/** A location change reported by a history implementation. */
export interface ZeusHistoryUpdate {
  readonly action: 'POP' | 'PUSH' | 'REPLACE'
  readonly location: ZeusLocation
  readonly delta: number | null
}

/**
 * History contract accepted by `createRouter`. The browser and memory
 * implementations exported by this package satisfy it.
 */
export interface ZeusHistory {
  readonly location: ZeusLocation
  readonly action?: 'POP' | 'PUSH' | 'REPLACE'
  createHref(to: ZeusTo): string
  createURL(to: ZeusTo): URL
  encodeLocation(to: ZeusTo): {
    readonly pathname: string
    readonly search: string
    readonly hash: string
  }
  push(to: ZeusTo, state?: unknown): void
  replace(to: ZeusTo, state?: unknown): void
  go(delta: number): void
  listen(listener: (update: ZeusHistoryUpdate) => void): () => void
}

export interface ZeusBrowserHistoryOptions {
  window?: Window
}

export interface ZeusMemoryHistoryOptions {
  initialEntries?: ZeusTo[]
  initialIndex?: number
}

export interface ZeusRouterFuture {
  v7_fetcherPersist?: boolean
  v7_normalizeFormMethod?: boolean
  v7_partialHydration?: boolean
  v7_prependBasename?: boolean
  v7_relativeSplatPath?: boolean
  v7_skipActionErrorRevalidation?: boolean
}

export interface ZeusHydrationData {
  loaderData?: ZeusRouteData
  actionData?: ZeusRouteData
  errors?: ZeusRouteData
}

export interface ZeusRouterOptions {
  routes: ZeusRouteObject[]
  history?: ZeusHistory
  basename?: string
  window?: Window
  /** Use browser history when no explicit history is provided. */
  browserHistory?: ZeusBrowserHistoryOptions
  /** Use memory history when no explicit history is provided. */
  memoryHistory?: ZeusMemoryHistoryOptions
  hydrationData?: ZeusHydrationData
  future?: ZeusRouterFuture
}
