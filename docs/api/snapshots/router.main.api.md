# @zeus-js/router (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import {
  Location,
  AgnosticDataRouteMatch,
  RouterState,
  Router,
  To,
  AgnosticDataRouteObject,
  History,
  BrowserHistoryOptions,
  MemoryHistoryOptions,
  RouterInit,
} from '@remix-run/router'
export {
  ActionFunction,
  ActionFunctionArgs,
  AgnosticDataIndexRouteObject,
  AgnosticDataNonIndexRouteObject,
  AgnosticDataRouteMatch,
  AgnosticDataRouteObject,
  AgnosticIndexRouteObject,
  AgnosticNonIndexRouteObject,
  AgnosticRouteObject,
  BrowserHistoryOptions,
  DataStrategyFunction,
  DataStrategyFunctionArgs,
  DataStrategyResult,
  ErrorResponse,
  HTMLFormMethod,
  LoaderFunction,
  LoaderFunctionArgs,
  Params,
  RouterNavigateOptions,
  RouterState,
  ShouldRevalidateFunction,
  To,
  createBrowserHistory,
  createMemoryHistory,
} from '@remix-run/router'
import { Accessor } from '@zeus-js/signal'

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
  readonly router: Router
  /** Navigate without coupling a component to the underlying router package. */
  navigate(
    to: To | number,
    options?: Parameters<Router['navigate']>[1],
  ): Promise<void>
  /** Preload a target route's loader data without changing the current location. */
  preload(
    to: string,
    options?: {
      routeId?: string
    },
  ): Promise<void>
  dispose(): void
}
/**
 * Creates a Zeus router backed by @remix-run/router's data-router core.
 * The returned accessors are stable and update only when the corresponding
 * router state changes.
 */
export declare function createRouter(options: ZeusRouterOptions): ZeusRouter
```
