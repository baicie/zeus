import { createContext, type Context } from '@zeus-js/runtime-dom'

import type { ZeusRouter } from './types'

/** Current route context provided around each rendered route element. */
export interface RouteContextValue {
  /** Id of the route whose element is currently rendered. */
  readonly routeId: string
  /** Index of this route in the active match chain. */
  readonly depth: number
  /** True when the route failed and deeper routes are not rendered. */
  readonly blocked: boolean
}

/** @internal Router context consumed by hooks and declarative components. */
export const RouterContext: Context<ZeusRouter | undefined> = createContext<
  ZeusRouter | undefined
>()

/** @internal Route context provided by Outlet around each route element. */
export const RouteContext: Context<RouteContextValue | undefined> =
  createContext<RouteContextValue | undefined>()

/**
 * @internal Error accessor for the route element that is currently rendered.
 * The value is `undefined` when the route loaded successfully.
 */
export const RouteErrorContext: Context<(() => unknown) | undefined> =
  createContext<(() => unknown) | undefined>()
