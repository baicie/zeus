import { createComponent, mountDynamic, useContext } from '@zeus-js/runtime-dom'
import { createMemo } from '@zeus-js/signal'

import { RouteContext, RouteErrorContext } from './context'
import { useRouter } from './hooks'

import type { RouteContextValue } from './context'
import type { ZeusRouteComponent, ZeusRouteMatch, ZeusRouter } from './types'
import type { JSXValue } from '@zeus-js/runtime-dom'

/** The route selected for one Outlet level. */
interface OutletTarget {
  readonly match?: ZeusRouteMatch
  readonly index: number
  readonly error: unknown
  readonly erroring: boolean
}

const NO_TARGET: OutletTarget = {
  match: undefined,
  index: 0,
  error: undefined,
  erroring: false,
}

/**
 * Renders the next route in the active match chain. Routes without `element`
 * are transparent: the Outlet continues to the next match instead of creating
 * a DOM boundary. An `errorElement` on a transparent route turns it into an
 * error boundary for its children: while healthy it passes through, while a
 * descendant fails it renders the error UI and blocks deeper Outlets until the
 * route recovers.
 */
export function Outlet(): JSXValue {
  const router = useRouter()
  const parent = useContext(
    RouteContext,
    undefined as unknown as RouteContextValue | undefined,
  )

  if (parent?.blocked) return null

  const depth = parent ? parent.depth + 1 : 0
  let previous: OutletTarget | undefined
  const target = createMemo<OutletTarget>(() => {
    const next = selectTarget(router, depth, previous)
    previous = next
    return next
  })

  const fragment = document.createDocumentFragment()
  const start = document.createComment('zeus-outlet-start')
  const end = document.createComment('zeus-outlet-end')
  fragment.append(start, end)

  mountDynamic(fragment, end, () => renderTarget(target()))

  return fragment
}

function selectTarget(
  router: ZeusRouter,
  depth: number,
  previous: OutletTarget | undefined,
): OutletTarget {
  const matches = router.matches()
  const errors = router.errors()
  let index = depth

  while (index < matches.length) {
    const match = matches[index]!
    const route = match.route
    const failing = errors !== null && hasError(errors, route.id)
    const error = failing
      ? (errors as Record<string, unknown>)[route.id]
      : undefined

    // A failing route always ends this Outlet level: its `errorElement`
    // replaces the subtree, and a boundary without one renders nothing.
    if (failing) return select(index, match, error, true, previous)

    // A route with an element is the next DOM boundary.
    if (route.element !== undefined) {
      return select(index, match, undefined, false, previous)
    }

    // A pathless route with only an `errorElement` is a transparent error
    // boundary: while healthy its children render in its place.
    index += 1
  }

  return previous?.index === index && previous.match === undefined
    ? previous
    : NO_TARGET
}

function select(
  index: number,
  match: ZeusRouteMatch,
  error: unknown,
  erroring: boolean,
  previous: OutletTarget | undefined,
): OutletTarget {
  const same =
    previous !== undefined &&
    previous.index === index &&
    previous.erroring === erroring &&
    previous.error === error &&
    previous.match?.route === match.route

  return same ? previous : { match, index, error, erroring }
}

function renderTarget(target: OutletTarget): JSXValue {
  const match = target.match
  if (!match) return null

  const route = match.route
  const component: ZeusRouteComponent | undefined =
    target.erroring && route.errorElement !== undefined
      ? route.errorElement
      : route.element

  // An error boundary without an element can render neither an error UI nor
  // its children; deeper match entries are unreachable until it recovers.
  if (!component) return null

  const value: RouteContextValue = {
    routeId: route.id,
    depth: target.index,
    blocked: target.erroring && route.errorElement !== undefined,
  }
  const error = target.error

  return RouteContext.Provider({
    value,
    children: () =>
      RouteErrorContext.Provider({
        value: () => error,
        children: () => createComponent(component, {}),
      }),
  })
}

function hasError(
  errors: Readonly<Record<string, unknown>>,
  routeId: string,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(errors, routeId) &&
    errors[routeId] !== undefined
  )
}
