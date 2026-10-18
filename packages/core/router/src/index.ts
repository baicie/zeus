import {
  createBrowserHistory,
  createMemoryHistory,
  createRouter as createRemixRouter,
  matchRoutes,
  type AgnosticDataRouteMatch,
  type AgnosticDataRouteObject,
  type BrowserHistoryOptions,
  type History,
  type Location,
  type MemoryHistoryOptions,
  type Router as RemixRouter,
  type RouterInit,
  type RouterNavigateOptions,
  type RouterState,
  type To,
} from '@remix-run/router'
import { batch, createSignal, onCleanup, type Accessor } from '@zeus-js/signal'
import { getCurrentScope } from '@zeus-js/signal/internal'

export type {
  ActionFunction,
  ActionFunctionArgs,
  BrowserHistoryOptions,
  AgnosticDataIndexRouteObject,
  AgnosticDataNonIndexRouteObject,
  AgnosticDataRouteMatch,
  AgnosticDataRouteObject,
  AgnosticIndexRouteObject,
  AgnosticNonIndexRouteObject,
  AgnosticRouteObject,
  DataStrategyFunction,
  DataStrategyFunctionArgs,
  DataStrategyResult,
  ErrorResponse,
  HTMLFormMethod,
  LoaderFunction,
  LoaderFunctionArgs,
  Params,
  RouterState,
  RouterNavigateOptions,
  ShouldRevalidateFunction,
  To,
} from '@remix-run/router'

export interface ZeusRouterOptions {
  /** Route tree consumed by @remix-run/router. Every data route must have an id. */
  routes: AgnosticDataRouteObject[]
  /** History implementation. Defaults to browser history in a DOM and memory history in SSR/tests. */
  history?: History
  basename?: string
  window?: Window
  /** Use browser history when no explicit history is provided. */
  browserHistory?: BrowserHistoryOptions
  /** Use memory history when no explicit history is provided. */
  memoryHistory?: MemoryHistoryOptions
  hydrationData?: RouterInit['hydrationData']
  future?: RouterInit['future']
}

export interface ZeusRouterSnapshot {
  readonly location: Location
  readonly matches: AgnosticDataRouteMatch[]
  readonly navigation: RouterState['navigation']
  readonly revalidation: RouterState['revalidation']
  readonly loaderData: RouterState['loaderData']
  readonly actionData: RouterState['actionData']
  readonly errors: RouterState['errors']
  readonly initialized: boolean
}

export interface ZeusRouterAccessors {
  readonly state: Accessor<ZeusRouterSnapshot>
  readonly location: Accessor<Location>
  readonly pathname: Accessor<string>
  readonly search: Accessor<string>
  readonly hash: Accessor<string>
  readonly matches: Accessor<AgnosticDataRouteMatch[]>
  readonly params: Accessor<Record<string, string | undefined>>
  readonly loaderData: Accessor<RouterState['loaderData']>
  readonly actionData: Accessor<RouterState['actionData']>
  readonly errors: Accessor<RouterState['errors']>
  readonly navigation: Accessor<RouterState['navigation']>
  readonly revalidation: Accessor<RouterState['revalidation']>
  readonly initialized: Accessor<boolean>
}

export interface ZeusRouter extends ZeusRouterAccessors {
  readonly router: RemixRouter
  /** Navigate without coupling a component to the underlying router package. */
  navigate(
    to: To | number,
    options?: Parameters<RemixRouter['navigate']>[1],
  ): Promise<void>
  /** Preload a target route's loader data without changing the current location. */
  preload(to: string, options?: { routeId?: string }): Promise<void>
  dispose(): void
}

function createDefaultHistory(options: ZeusRouterOptions): History {
  if (options.history) return options.history

  if (typeof window !== 'undefined' || options.window) {
    return createBrowserHistory({
      ...options.browserHistory,
      window: options.browserHistory?.window ?? options.window,
    })
  }

  return createMemoryHistory(options.memoryHistory)
}

function lastMatchParams(
  matches: AgnosticDataRouteMatch[],
): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {}
  for (const match of matches) Object.assign(params, match.params)
  return params
}

/**
 * Creates a Zeus router backed by @remix-run/router's data-router core.
 * The returned accessors are stable and update only when the corresponding
 * router state changes.
 */
export function createRouter(options: ZeusRouterOptions): ZeusRouter {
  const history = createDefaultHistory(options)
  const router = createRemixRouter({
    routes: options.routes,
    history,
    basename: options.basename,
    hydrationData: options.hydrationData,
    future: options.future,
    window: options.window,
  }).initialize()

  const initial = router.state
  const [state, setState] = createSignal<ZeusRouterSnapshot>(snapshot(initial))
  const pendingPreloads = new Set<() => void>()
  let disposed = false

  const unsubscribe = router.subscribe(next => {
    batch(() => setState(snapshot(next)))
  })

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    for (const cancel of pendingPreloads) cancel()
    unsubscribe()
    router.dispose()
  }

  // createRoot connects router lifetime to the caller's active Zeus owner.
  // When no owner is active, onCleanup is a no-op and dispose remains explicit.
  if (getCurrentScope()) onCleanup(dispose)

  const stateAccessor = (): ZeusRouterSnapshot => state()
  const location = (): Location => state().location
  const matches = (): AgnosticDataRouteMatch[] => state().matches

  return {
    router,
    state: stateAccessor,
    location,
    pathname: () => location().pathname,
    search: () => location().search,
    hash: () => location().hash,
    matches,
    params: () => lastMatchParams(matches()),
    loaderData: () => state().loaderData,
    actionData: () => state().actionData,
    errors: () => state().errors,
    navigation: () => state().navigation,
    revalidation: () => state().revalidation,
    initialized: () => state().initialized,
    navigate: (to, navigateOptions) =>
      typeof to === 'number'
        ? router.navigate(to)
        : router.navigate(to, navigateOptions as RouterNavigateOptions),
    preload: (to, preloadOptions) =>
      preload(router, options.routes, to, preloadOptions, cancel => {
        pendingPreloads.add(cancel)
        return () => pendingPreloads.delete(cancel)
      }),
    dispose,
  }
}

function snapshot(state: RouterState): ZeusRouterSnapshot {
  return {
    location: state.location,
    matches: state.matches,
    navigation: state.navigation,
    revalidation: state.revalidation,
    loaderData: state.loaderData,
    actionData: state.actionData,
    errors: state.errors,
    initialized: state.initialized,
  }
}

async function preload(
  router: RemixRouter,
  routes: AgnosticDataRouteObject[],
  href: string,
  options?: { routeId?: string },
  registerCancel?: (cancel: () => void) => () => void,
): Promise<void> {
  const matches = matchRoutes(routes, href, router.basename)
  const match = options?.routeId
    ? matches?.find(item => item.route.id === options.routeId)
    : matches?.[matches.length - 1]

  const routeId = match?.route.id
  if (!match || !routeId) {
    throw new Error(`Cannot preload route without a matching route id: ${href}`)
  }

  const key = `zeus-preload:${routeId}:${href}`
  const previousErrors = router.state.errors

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let unregisterCancel = (): void => {}
    const finish = (error?: unknown): void => {
      if (settled) return
      settled = true
      stop()
      unregisterCancel()
      router.deleteFetcher(key)
      if (error === undefined) resolve()
      else reject(error)
    }
    const stop = router.subscribe(state => {
      const fetcher = state.fetchers.get(key)
      if (fetcher?.state === 'loading' || fetcher?.state === 'submitting')
        return
      if (!fetcher && state.errors !== previousErrors && state.errors) {
        const failedRouteId = options?.routeId ?? routeId
        const error =
          state.errors[failedRouteId] ?? Object.values(state.errors)[0]
        finish(error ?? new Error(`Preloading route failed: ${href}`))
      } else if (fetcher?.state === 'idle') {
        finish()
      }
    })
    unregisterCancel =
      registerCancel?.(() =>
        finish(
          new Error(`Router was disposed while preloading route: ${href}`),
        ),
      ) ?? unregisterCancel

    try {
      router.fetch(key, routeId, href)
      const fetcher = router.state.fetchers.get(key)
      if (fetcher?.state === 'idle') finish()
    } catch (error) {
      finish(error)
    }
  })
}

export { createBrowserHistory, createMemoryHistory }
