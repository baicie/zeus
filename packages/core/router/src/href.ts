import {
  createPath,
  resolvePath,
  resolveTo,
  stripBasename,
} from '@remix-run/router'

import { getEngineInfo } from './internal'

import type { RouteContextValue } from './context'
import type { ZeusRouteMatch, ZeusRouter, ZeusTo } from './types'

const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:/i

/** @internal True for `https:`, `mailto:`, and other non-app URLs. */
export function isAbsoluteHref(to: ZeusTo): boolean {
  return typeof to === 'string' && ABSOLUTE_URL.test(to)
}

function currentAppPathname(router: ZeusRouter): string {
  const info = getEngineInfo(router)
  const pathname = router.location().pathname
  return stripBasename(pathname, info.basename) ?? pathname
}

/** @internal Resolves a `to` value into an app-relative path (no basename). */
export function resolveAppPath(
  router: ZeusRouter,
  to: ZeusTo,
  route?: RouteContextValue,
  relative: 'route' | 'path' = 'route',
): string {
  if (isAbsoluteHref(to)) return to as string

  const info = getEngineInfo(router)
  const matches = router.matches()
  const contextual = route ? matches.slice(0, route.depth + 1) : matches
  const bases = routeBases(contextual, info.future.v7_relativeSplatPath)

  return createPath(
    resolveTo(
      to as Parameters<typeof resolveTo>[0],
      bases,
      currentAppPathname(router),
      relative === 'path',
    ),
  )
}

/** @internal Resolves `to` relative to the current location, no route context. */
export function resolveAppLocation(router: ZeusRouter, to: ZeusTo): string {
  if (isAbsoluteHref(to)) return to as string
  return createPath(
    resolvePath(
      to as Parameters<typeof resolvePath>[0],
      currentAppPathname(router),
    ),
  )
}

/** @internal Href including the router basename. */
export function resolveHref(
  router: ZeusRouter,
  to: ZeusTo,
  route?: RouteContextValue,
  relative: 'route' | 'path' = 'route',
): string {
  if (isAbsoluteHref(to)) return to as string
  return withBasename(
    resolveAppPath(router, to, route, relative),
    getEngineInfo(router).basename,
  )
}

/** @internal `router.createHref` implementation. */
export function createHrefForRouter(router: ZeusRouter, to: ZeusTo): string {
  if (isAbsoluteHref(to)) return to as string
  return withBasename(
    resolveAppLocation(router, to),
    getEngineInfo(router).basename,
  )
}

/** @internal Current location's app-relative pathname. */
export function appPathname(router: ZeusRouter): string {
  return currentAppPathname(router)
}

/** @internal */
export function withBasename(path: string, basename: string): string {
  if (basename === '/' || basename === '') return path
  if (isAbsoluteHref(path)) return path

  const base = basename.endsWith('/') ? basename.slice(0, -1) : basename
  const [beforeHash, hash = ''] = splitOnce(path, '#')
  const [pathname, search = ''] = splitOnce(beforeHash, '?')
  const nextPathname = pathname === '/' ? base : `${base}${pathname}`

  return `${nextPathname}${search}${hash}`
}

function splitOnce(value: string, delimiter: string): [string, string?] {
  const index = value.indexOf(delimiter)
  if (index < 0) return [value]
  return [value.slice(0, index), value.slice(index)]
}

function routeBases(
  matches: readonly ZeusRouteMatch[],
  v7RelativeSplatPath: boolean,
): string[] {
  const pathMatches = matches.filter(
    (match, index) =>
      index === 0 || (match.route.path && match.route.path.length > 0),
  )

  if (v7RelativeSplatPath) {
    return pathMatches.map((match, index) =>
      index === pathMatches.length - 1 ? match.pathname : match.pathnameBase,
    )
  }

  return pathMatches.map(match => match.pathnameBase)
}
