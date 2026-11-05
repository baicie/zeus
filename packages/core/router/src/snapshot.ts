import { stripBasename } from '@remix-run/router'

import type {
  ZeusFetcher,
  ZeusLocation,
  ZeusNavigation,
  ZeusParams,
  ZeusRouteData,
  ZeusRouteMatch,
  ZeusRouterSnapshot,
  ZeusTo,
} from './types'
import type {
  AgnosticDataRouteMatch,
  AgnosticDataRouteObject,
  Location as RemixLocation,
  RouterState,
} from '@remix-run/router'

/**
 * @internal Projects engine state onto the Zeus snapshot. Locations are
 * app-relative: the router basename is part of hrefs, not of route state, so
 * `pathname()` returns the same path whatever basename the app is mounted at.
 */
export function snapshot(
  state: RouterState,
  basename = '/',
): ZeusRouterSnapshot {
  return {
    location: location(state.location, basename),
    matches: matches(state.matches),
    navigation: navigation(state.navigation, basename),
    revalidation: state.revalidation,
    loaderData: (state.loaderData ?? {}) as ZeusRouteData,
    actionData: (state.actionData ?? null) as ZeusRouteData | null,
    errors: (state.errors ?? null) as ZeusRouteData | null,
    fetchers: fetchers(
      state.fetchers as unknown as Map<string, ZeusFetcher>,
      basename,
    ),
    initialized: state.initialized,
  }
}

/** @internal */
export function location(value: RemixLocation, basename = '/'): ZeusLocation {
  const appPathname = stripBasename(value.pathname, basename) ?? value.pathname

  return {
    pathname: appPathname,
    search: value.search,
    hash: value.hash,
    state: value.state,
    key: value.key,
  }
}

function matches(values: AgnosticDataRouteMatch[]): ZeusRouteMatch[] {
  // The route object identity is preserved deliberately: Outlet uses it to
  // decide whether a route subtree must be replaced.
  return values.map(match => ({
    params: match.params as ZeusParams,
    pathname: match.pathname,
    pathnameBase: match.pathnameBase,
    route: match.route as unknown as ZeusRouteMatch['route'],
  }))
}

function navigation(
  value: RouterState['navigation'],
  basename: string,
): ZeusNavigation {
  if (value.state === 'idle') {
    return {
      state: 'idle',
      location: undefined,
      formMethod: undefined,
      formAction: undefined,
      formData: undefined,
    }
  }

  return {
    state: value.state,
    location: location(value.location, basename),
    formMethod: value.formMethod,
    formAction:
      value.formAction === undefined
        ? undefined
        : appPath(value.formAction, basename),
    formData: value.formData,
  }
}

// Fetcher state is copied only when a basename must be stripped; with the
// default basename the engine map is exposed as-is to avoid per-update copies.
function fetchers(
  values: Map<string, ZeusFetcher>,
  basename: string,
): ReadonlyMap<string, ZeusFetcher> {
  if (basename === '/') return values

  const next = new Map<string, ZeusFetcher>()

  for (const [key, value] of values) {
    next.set(key, {
      state: value.state,
      data: value.data,
      formMethod: value.formMethod,
      formAction:
        value.formAction === undefined
          ? undefined
          : appPath(value.formAction, basename),
      formData: value.formData,
    })
  }

  return next
}

function appPath(pathname: string, basename: string): string {
  return stripBasename(pathname, basename) ?? pathname
}

/** @internal Route objects accepted by the router engine. */
export type EngineRoutes = AgnosticDataRouteObject[]

/** @internal */
export function toEngineTo(to: ZeusTo): string | Partial<ZeusLocation> {
  return to as string | Partial<ZeusLocation>
}
