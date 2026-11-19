import { inject } from '@zeus-js/runtime-dom'
import { onCleanup } from '@zeus-js/signal'

import { RouteContext, RouteErrorContext, RouterContext } from './context'
import { resolveAppPath, resolveHref } from './href'
import { getGateway } from './internal'

import type {
  ZeusFetcherHandle,
  ZeusFetcherSubmitData,
  ZeusLocation,
  ZeusNavigation,
  ZeusParams,
  ZeusRevalidationState,
  ZeusRouteData,
  ZeusRouteMatch,
  ZeusRouter,
  ZeusRouterSnapshot,
  ZeusTo,
} from './types'
import type { Accessor } from '@zeus-js/signal'

/** Returns the router provided by `<RouterProvider>`; throws outside it. */
export function useRouter(): ZeusRouter {
  const router = inject(RouterContext, undefined)
  if (!router) {
    throw new Error(
      '[Zeus router] useRouter() must be called inside <RouterProvider>.',
    )
  }
  return router
}

/** Current location accessor; read it inside a binding to track changes. */
export function useLocation(): Accessor<ZeusLocation> {
  return useRouter().location
}

/** Current pathname accessor. */
export function usePathname(): Accessor<string> {
  return useRouter().pathname
}

/** Params merged from the active match chain. */
export function useParams(): Accessor<ZeusParams> {
  return useRouter().params
}

/** Active route matches, from root to leaf. */
export function useMatches(): Accessor<ZeusRouteMatch[]> {
  return useRouter().matches
}

/** Loader data keyed by route id. */
export function useLoaderData(): Accessor<ZeusRouteData> {
  return useRouter().loaderData
}

/** Action data keyed by route id. */
export function useActionData(): Accessor<ZeusRouteData | null> {
  return useRouter().actionData
}

/** Navigation progress (`idle`, `loading`, `submitting`). */
export function useNavigation(): Accessor<ZeusNavigation> {
  return useRouter().navigation
}

/** Revalidation progress for the active navigation. */
export function useRevalidation(): Accessor<ZeusRevalidationState> {
  return useRouter().revalidation
}

/** Full router snapshot; useful for advanced bindings and diagnostics. */
export function useRouterState(): Accessor<ZeusRouterSnapshot> {
  return useRouter().state
}

/**
 * Returns the error that blocked the current route element. Inside a route
 * subtree rendered by `<Outlet>`, this is that route's error; elsewhere it is
 * the first error in the active match chain.
 */
export function useRouteError(): Accessor<unknown> {
  const scoped = inject(RouteErrorContext, undefined)
  if (scoped) return scoped

  const router = useRouter()

  return () => {
    const errors = router.errors()
    if (!errors) return undefined

    const matches = router.matches()
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const id = matches[index]!.route.id
      if (Object.prototype.hasOwnProperty.call(errors, id)) return errors[id]
    }

    return Object.values(errors)[0]
  }
}

/**
 * Builds an href for `to`, including the configured basename. The returned
 * function resolves against the current route and tracks router state.
 */
export function useHref(
  to: ZeusTo,
  options: { relative?: 'route' | 'path' } = {},
): Accessor<string> {
  const router = useRouter()
  const route = inject(RouteContext, undefined)

  return () => resolveHref(router, to, route, options.relative)
}

/**
 * Creates a keyed fetcher bound to the nearest route. The fetcher is removed
 * (and its request aborted) when the owning component is disposed.
 */
export function useFetcher<T = unknown>(): ZeusFetcherHandle<T> {
  const router = useRouter()
  const route = inject(RouteContext, undefined)
  const gateway = getGateway(router)
  const key = `zeus-fetcher:${nextFetcherId()}`

  const read = () => router.fetchers().get(key)

  const handle: ZeusFetcherHandle<T> = {
    state: () => read()?.state ?? 'idle',
    data: () => read()?.data as T | undefined,
    formMethod: () => read()?.formMethod,
    formAction: () => read()?.formAction,
    formData: () => read()?.formData,
    load: (href, options) => {
      gateway.fetch(
        key,
        options?.routeId ?? currentRouteId(route, 'load'),
        resolveAppPath(router, href, route),
      )
    },
    submit: (data, options) => {
      gateway.fetch(
        key,
        options?.routeId ?? currentRouteId(route, 'submit'),
        resolveAppPath(router, options?.action ?? router.location(), route),
        {
          formMethod: (options?.method ?? 'get').toLowerCase(),
          formData: toFormData(data),
          preventScrollReset: options?.preventScrollReset,
        },
      )
    },
    cancel: () => gateway.deleteFetcher(key),
  }

  onCleanup(handle.cancel)

  return handle
}

function currentRouteId(
  route: { readonly routeId: string } | undefined,
  action: string,
): string {
  if (route) return route.routeId
  throw new Error(
    `[Zeus router] fetcher.${action}() needs a route context; render it inside a route element or pass \`routeId\`.`,
  )
}

let fetcherSequence = 0
function nextFetcherId(): number {
  fetcherSequence += 1
  return fetcherSequence
}

function toFormData(data: ZeusFetcherSubmitData): FormData {
  if (data instanceof FormData) return data

  const formData = new FormData()
  if (data instanceof URLSearchParams) {
    for (const [name, value] of data) formData.append(name, value)
    return formData
  }

  if (data) {
    for (const [name, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue
      formData.append(name, String(value))
    }
  }

  return formData
}
