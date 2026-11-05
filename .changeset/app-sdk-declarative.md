---
'@zeus-js/router': minor
'@zeus-js/query': minor
---

Add the declarative application SDK. `@zeus-js/router` now ships
`RouterProvider`, `Link`, `Outlet` and accessor-returning hooks (`useRouter`,
`useLocation`, `useParams`, `useLoaderData`, `useNavigation`, `useRouteError`,
`useFetcher`, …) on top of the existing router engine, so applications render
route trees without re-running components. `@zeus-js/query` replaces the
module-level `createQuery` / `createInfiniteQuery` / `createMutation` factories
and the public `QueryClient` field with a Zeus-owned client
(`createQueryClient`, `getQueryData`, `setQueryData`, `invalidateQueries`, …),
`QueryClientProvider` context scoping, `useQueryClient`, `useQuery`,
`useInfiniteQuery` and `useMutation` with typed `{ client }` helpers for
optimistic updates. `@tanstack/query-core` and `@remix-run/router` stay
implementation details; their types are no longer exported.
