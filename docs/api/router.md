# Router

`@zeus-js/router` adapts the framework-agnostic data router from
`@remix-run/router` to Zeus. Matching, nested routes, params, data loading,
history, preload, and error propagation stay in the router engine; Zeus exposes
the resulting state through stable accessors and a declarative component layer.

The engine is an implementation detail: every public type (`ZeusRouter`,
`ZeusRouteObject`, `ZeusLocation`, `ZeusFetcher`, …) is owned by Zeus, so the
component and hook semantics survive a future engine migration.

## Declarative router

```tsx
import { render } from '@zeus-js/zeus'
import { Link, Outlet, RouterProvider, createRouter } from '@zeus-js/router'

const router = createRouter({
  routes: [
    {
      id: 'root',
      path: '/',
      element: () => (
        <nav>
          <Link to="/users">Users</Link>
          <Outlet />
        </nav>
      ),
      children: [
        { id: 'home', index: true, element: () => <h1>Home</h1> },
        {
          id: 'user',
          path: 'users/:id',
          loader: ({ params, request }) => loadUser(params.id, request.signal),
          element: () => <UserPage />,
          errorElement: () => <UserError />,
        },
      ],
    },
  ],
})

render(
  () => <RouterProvider router={router} />,
  document.getElementById('root')!,
)
```

`RouterProvider` provides the router to the subtree. Without children it renders
the root `<Outlet>`; pass `children` to wrap it in application chrome.
`RouterProvider`, `Link` and `Outlet` initialize once and update DOM through
bindings, never by re-running the component tree.

### Outlet

`Outlet` renders the next route in the active match chain:

- routes without `element` are transparent pathless/layout layers;
- a route with only an `errorElement` is a transparent error boundary — while
  healthy its children render in its place, when a descendant fails it renders
  the error UI and blocks deeper outlets;
- `Outlet` replaces the subtree only when the selected route object or its error
  identity changes, so a params/search change updates bindings without
  rebuilding layouts or lists.

### Link

`Link` renders a real `<a>` with a resolved `href`. A plain, same-origin
left click is intercepted and routed through `router.navigate`; modifier keys,
`target`, `download`, `defaultPrevented` and absolute URLs keep browser
behavior. Props other than `to`/`replace`/`state`/`relative`/
`preventScrollReset`/`preload`/`children` are bound reactively to the anchor.
`aria-current` defaults to `page` when the target matches the active location.
`preload="intent"` calls `router.preload` on pointer enter or focus.

### Hooks

Every hook returns a stable accessor so reading it inside a binding tracks
changes:

| Hook                    | Result                                                   |
| ----------------------- | -------------------------------------------------------- |
| `useRouter()`           | the router; throws outside `<RouterProvider>`            |
| `useLocation()`         | `ZeusLocation` (pathname, search, hash, state, key)      |
| `usePathname()`         | current pathname                                         |
| `useParams()`           | merged params of the active match chain                  |
| `useMatches()`          | active matches, root to leaf                             |
| `useLoaderData()`       | loader data keyed by route id                            |
| `useActionData()`       | action data keyed by route id                            |
| `useNavigation()`       | `idle` / `loading` / `submitting` navigation state       |
| `useRevalidation()`     | revalidation state for the active navigation             |
| `useRouterState()`      | full router snapshot for advanced bindings and tooling   |
| `useRouteError()`       | the error that blocked the current route (or chain-wide) |
| `useHref(to, options?)` | basename-aware href accessor                             |
| `useFetcher()`          | route-bound fetcher with `load`/`submit`/`cancel`        |

`useFetcher()` is removed with its owner: disposing the component deletes the
fetcher and aborts its request. Use `routeId` in `load`/`submit` options when
calling it outside a route element.

## Router accessors

The same state is available directly on the router returned by `createRouter`:

```ts
router.pathname() // '/users/42'
router.params() // { id: '42' }
router.navigation() // { state: 'idle' } | { state: 'loading', location }
router.errors() // { user: ErrorResponse } | null
await router.navigate('/users/43')
await router.navigate(-1)
router.createHref('/users/43') // includes the configured basename
await router.preload('/users/44')
router.dispose()
```

`basename` is applied by the engine for navigation and exposed through
`createHref`/`Link`, while `location()`, `pathname()` and navigation targets
stay application-relative.

When `createRouter` runs in an active Zeus owner, that owner's cleanup disposes
the router subscription and aborts active navigation/fetcher work. Call
`router.dispose()` when creating it outside an owner. The default history is
browser history in a DOM and memory history in non-browser environments; pass a
history explicitly to control the environment. `createBrowserHistory` and
`createMemoryHistory` return Zeus-owned `ZeusHistory` values.

## Loading, errors and cancellation

- `useNavigation()` exposes `idle`, `loading` and `submitting`; bind it to
  status text or `aria-busy`.
- A loader/action failure propagates to the nearest route declaring
  `hasErrorBoundary` (or any `errorElement`). That route's `errorElement`
  replaces its element; `useRouteError()` returns the error. A boundary without
  `errorElement` renders nothing and blocks deeper outlets.
- Recovering means re-running the failed loader: navigate to the same location
  with `{ replace: true }`, and the element remounts once loading succeeds.
- A new navigation aborts the previous one and the fetchers' requests; loaders
  see it through `request.signal`.

In a browser, `preload(href)` invokes the matching leaf route loader without
committing the location and removes its temporary fetcher after it settles.
Failures reject the promise and are exposed through `errors()` for the route's
error boundary. `@remix-run/router` prohibits fetcher preloads during server
rendering, so call it only from browser interactions.
