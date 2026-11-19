import {
  createRouter as createRemixRouter,
  matchRoutes,
  type AgnosticDataRouteObject,
  type Router as RemixRouter,
  type RouterInit,
  type RouterNavigateOptions,
  type RouterState,
} from '@remix-run/router'
import { batch, createSignal, onCleanup } from '@zeus-js/signal'
import { getCurrentScope } from '@zeus-js/signal/internal'

import { createBrowserHistory, createMemoryHistory } from './history'
import { createHrefForRouter, resolveAppLocation } from './href'
import { registerEngine } from './internal'
import { snapshot } from './snapshot'

import type {
  ZeusHistory,
  ZeusNavigateOptions,
  ZeusParams,
  ZeusRouteMatch,
  ZeusRouter,
  ZeusRouterOptions,
  ZeusRouterSnapshot,
  ZeusTo,
} from './types'

export { createBrowserHistory, createMemoryHistory }

export { RouterProvider, type RouterProviderProps } from './provider'
export { Link, type LinkProps } from './link'
export { Outlet } from './outlet'

export {
  useActionData,
  useFetcher,
  useHref,
  useLoaderData,
  useLocation,
  useMatches,
  useNavigation,
  useParams,
  usePathname,
  useRevalidation,
  useRouteError,
  useRouter,
  useRouterState,
} from './hooks'

export type {
  ZeusActionFunction,
  ZeusActiveNavigation,
  ZeusBrowserHistoryOptions,
  ZeusDataRoute,
  ZeusFetcher,
  ZeusFetcherHandle,
  ZeusFetcherLoadOptions,
  ZeusFetcherSubmitData,
  ZeusFetcherSubmitOptions,
  ZeusHistory,
  ZeusHistoryUpdate,
  ZeusHydrationData,
  ZeusIdleNavigation,
  ZeusLoaderFunction,
  ZeusLoaderFunctionArgs,
  ZeusLocation,
  ZeusMemoryHistoryOptions,
  ZeusNavigateOptions,
  ZeusNavigation,
  ZeusParams,
  ZeusRevalidationState,
  ZeusRouteComponent,
  ZeusRouteData,
  ZeusRouteMatch,
  ZeusRouteObject,
  ZeusRouter,
  ZeusRouterAccessors,
  ZeusRouterFuture,
  ZeusRouterOptions,
  ZeusRouterSnapshot,
  ZeusShouldRevalidateFunction,
  ZeusShouldRevalidateFunctionArgs,
  ZeusTo,
} from './types'

function createDefaultHistory(options: ZeusRouterOptions): ZeusHistory {
  if (options.history) return options.history

  if (typeof window !== 'undefined' || options.window) {
    return createBrowserHistory({
      window: options.browserHistory?.window ?? options.window,
    })
  }

  return createMemoryHistory(options.memoryHistory)
}

function lastMatchParams(matches: ZeusRouteMatch[]): ZeusParams {
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
  const engine = createRemixRouter({
    routes: options.routes as unknown as AgnosticDataRouteObject[],
    // The engine treats an errorElement as an error boundary even when the
    // route omits the explicit flag.
    mapRouteProperties: route => ({
      hasErrorBoundary: Boolean(
        (route as { hasErrorBoundary?: boolean }).hasErrorBoundary ||
        (route as { errorElement?: unknown }).errorElement,
      ),
    }),
    history: history as unknown as RouterInit['history'],
    basename: options.basename,
    hydrationData: options.hydrationData as RouterInit['hydrationData'],
    // The adapter resolves public `to` values relative to the application
    // root, so the engine must prepend the basename for navigations/fetches.
    future: { ...options.future, v7_prependBasename: true },
    window: options.window,
  }).initialize()

  const basename = options.basename ?? '/'
  const [state, setState] = createSignal<ZeusRouterSnapshot>(
    snapshot(engine.state, basename),
  )
  const pendingPreloads = new Set<() => void>()
  let disposed = false
  let preloadSequence = 0

  const unsubscribe = engine.subscribe(next => {
    batch(() => setState(snapshot(next, basename)))
  })

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    for (const cancel of pendingPreloads) cancel()
    pendingPreloads.clear()
    unsubscribe()
    engine.dispose()
  }

  // Connecting to the caller's active Zeus owner binds the router lifetime to
  // the component root that created it.
  if (getCurrentScope()) onCleanup(dispose)

  const location = () => state().location
  const matches = () => state().matches

  const router: ZeusRouter = {
    state,
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
    fetchers: () => state().fetchers,
    createHref: to => createHrefForRouter(router, to),
    navigate: (to, navigateOptions) => navigate(engine, to, navigateOptions),
    revalidate: () => engine.revalidate(),
    preload: (to, preloadOptions) =>
      preload(
        engine,
        router,
        options.routes,
        to,
        preloadOptions,
        ++preloadSequence,
        cancel => {
          pendingPreloads.add(cancel)
          return () => pendingPreloads.delete(cancel)
        },
      ),
    dispose,
  }

  registerEngine(router, engine, engine.future, options.basename ?? '/')

  return router
}

async function navigate(
  engine: RemixRouter,
  to: ZeusTo | number,
  options?: ZeusNavigateOptions,
): Promise<void> {
  if (typeof to === 'number') {
    await engine.navigate(to)
    return
  }

  await engine.navigate(
    to as Parameters<RemixRouter['navigate']>[0],
    options as RouterNavigateOptions,
  )
}

/**
 * Runs the target route's loader through a temporary fetcher entry so the
 * current location stays untouched. The internal key is removed once the
 * loader settles.
 */
async function preload(
  engine: RemixRouter,
  router: ZeusRouter,
  routes: ZeusRouterOptions['routes'],
  to: ZeusTo,
  options: { routeId?: string } | undefined,
  sequence: number,
  registerCancel: (cancel: () => void) => () => void,
): Promise<void> {
  const href = resolveAppLocation(router, to)
  const matched = matchRoutes(
    routes as unknown as AgnosticDataRouteObject[],
    href,
  )
  const match = options?.routeId
    ? matched?.find(item => item.route.id === options.routeId)
    : matched?.[matched.length - 1]

  const routeId = match?.route.id
  if (!match || !routeId) {
    throw new Error(`Cannot preload route without a matching route id: ${href}`)
  }

  const key = `zeus-preload:${sequence}:${routeId}:${href}`
  const previousErrors = engine.state.errors

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let unregisterCancel = (): void => {}
    const finish = (error?: unknown): void => {
      if (settled) return
      settled = true
      stop()
      unregisterCancel()
      engine.deleteFetcher(key)
      if (error === undefined) resolve()
      else reject(error)
    }
    const stop = engine.subscribe((next: RouterState) => {
      const fetcher = next.fetchers.get(key)
      if (fetcher?.state === 'loading' || fetcher?.state === 'submitting')
        return
      if (fetcher?.state === 'idle') {
        finish()
        return
      }

      // A failed fetcher load is removed from the fetcher map and reported
      // through the route error channel instead.
      if (!fetcher && next.errors && next.errors !== previousErrors) {
        const error = next.errors[routeId] ?? Object.values(next.errors)[0]
        finish(error ?? new Error(`Preloading route failed: ${href}`))
      }
    })
    unregisterCancel = registerCancel(() =>
      finish(new Error(`Router was disposed while preloading route: ${href}`)),
    )

    try {
      engine.fetch(key, routeId, href)
      const fetcher = engine.state.fetchers.get(key)
      if (fetcher?.state === 'idle') finish()
    } catch (error) {
      finish(error)
    }
  })
}
