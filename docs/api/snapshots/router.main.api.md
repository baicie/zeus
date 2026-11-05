# @zeus-js/router (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { JSXValue } from '@zeus-js/runtime-dom'
import { Accessor } from '@zeus-js/signal'

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
  preload(
    to: ZeusTo,
    options?: {
      routeId?: string
    },
  ): Promise<void>
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

/** Creates a history backed by the browser URL and session history. */
export declare function createBrowserHistory(
  options?: ZeusBrowserHistoryOptions,
): ZeusHistory
/** Creates an in-memory history for SSR, tests, and embedded applications. */
export declare function createMemoryHistory(
  options?: ZeusMemoryHistoryOptions,
): ZeusHistory

export interface RouterProviderProps {
  /** Router created by `createRouter()`. */
  router: ZeusRouter
  /** Router tree. Defaults to the root `<Outlet />` when omitted. */
  children?: JSXValue | (() => JSXValue)
}
/**
 * Provides the router to the component subtree and renders its children.
 * The provider initializes once; state changes only update bindings below it.
 */
export declare function RouterProvider(props: RouterProviderProps): JSXValue

export interface LinkProps {
  /** Navigation target; resolved relative to the current route by default. */
  to: ZeusTo
  replace?: boolean
  state?: unknown
  relative?: 'route' | 'path'
  preventScrollReset?: boolean
  /** Preload the target route's loader while the link is hovered/focused. */
  preload?: 'intent' | false
  /** Defaults to `page` when the target matches the active location. */
  'aria-current'?:
    | 'page'
    | 'step'
    | 'location'
    | 'date'
    | 'time'
    | 'true'
    | 'false'
    | boolean
  [key: string]: unknown
}
/**
 * Renders a real anchor and drives client-side navigation for plain,
 * same-origin left clicks. All other props (class, style, data-*, events,
 * `ref`) are bound reactively through spread.
 */
export declare function Link(props: LinkProps): JSXValue

/**
 * Renders the next route in the active match chain. Routes without `element`
 * are transparent: the Outlet continues to the next match instead of creating
 * a DOM boundary. An `errorElement` on a transparent route turns it into an
 * error boundary for its children: while healthy it passes through, while a
 * descendant fails it renders the error UI and blocks deeper Outlets until the
 * route recovers.
 */
export declare function Outlet(): JSXValue

/** Returns the router provided by `<RouterProvider>`; throws outside it. */
export declare function useRouter(): ZeusRouter
/** Current location accessor; read it inside a binding to track changes. */
export declare function useLocation(): Accessor<ZeusLocation>
/** Current pathname accessor. */
export declare function usePathname(): Accessor<string>
/** Params merged from the active match chain. */
export declare function useParams(): Accessor<ZeusParams>
/** Active route matches, from root to leaf. */
export declare function useMatches(): Accessor<ZeusRouteMatch[]>
/** Loader data keyed by route id. */
export declare function useLoaderData(): Accessor<ZeusRouteData>
/** Action data keyed by route id. */
export declare function useActionData(): Accessor<ZeusRouteData | null>
/** Navigation progress (`idle`, `loading`, `submitting`). */
export declare function useNavigation(): Accessor<ZeusNavigation>
/** Revalidation progress for the active navigation. */
export declare function useRevalidation(): Accessor<ZeusRevalidationState>
/** Full router snapshot; useful for advanced bindings and diagnostics. */
export declare function useRouterState(): Accessor<ZeusRouterSnapshot>
/**
 * Returns the error that blocked the current route element. Inside a route
 * subtree rendered by `<Outlet>`, this is that route's error; elsewhere it is
 * the first error in the active match chain.
 */
export declare function useRouteError(): Accessor<unknown>
/**
 * Builds an href for `to`, including the configured basename. The returned
 * function resolves against the current route and tracks router state.
 */
export declare function useHref(
  to: ZeusTo,
  options?: {
    relative?: 'route' | 'path'
  },
): Accessor<string>
/**
 * Creates a keyed fetcher bound to the nearest route. The fetcher is removed
 * (and its request aborted) when the owning component is disposed.
 */
export declare function useFetcher<T = unknown>(): ZeusFetcherHandle<T>

/**
 * Creates a Zeus router backed by @remix-run/router's data-router core.
 * The returned accessors are stable and update only when the corresponding
 * router state changes.
 */
export declare function createRouter(options: ZeusRouterOptions): ZeusRouter
```
