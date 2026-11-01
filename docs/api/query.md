# Query

`@zeus-js/query` adapts `@tanstack/query-core` and exposes a Zeus-owned client
plus context-scoped hooks. Caching, deduplication, retry, pagination and
cancellation stay in query-core; the adapter projects observer results onto
Zeus signals and keeps the engine out of the public types.

## Client and provider

```ts
import { QueryClientProvider, createQueryClient } from '@zeus-js/query'

const client = createQueryClient()
```

`ZeusQueryClient` is the whole public surface:

```ts
await client.query({ queryKey, queryFn, signal }) // read-through cache
client.getQueryData<User>(['admin-user', id])
client.setQueryData<User>(['admin-user', id], next)
await client.invalidateQueries({ queryKey: ['admin-users'] })
await client.cancelQueries({ queryKey: ['admin-users'] })
client.removeQueries({ queryKey: ['admin-users'] })
client.clear()
client.dispose()
```

`QueryClientProvider` publishes the client through owner context. It mounts the
cache's focus/online listeners on initialization and releases them on cleanup;
`mount()` is reference-counted, so several providers may share one client. The
provider does not own the client lifetime — call `dispose()` when the shared
client is no longer needed.

```tsx
render(
  () => (
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  ),
  root,
)
```

## Hooks

```tsx
import { useMutation, useQuery, useQueryClient } from '@zeus-js/query'

function Users() {
  const query = useQuery(() => ({
    queryKey: ['users', page()],
    queryFn: ({ signal }) =>
      fetch(`/api/users?page=${page()}`, { signal }).then(r => r.json()),
    staleTime: 5_000,
    retry: 2,
  }))

  return (
    <section>
      <span>
        {query.pending() ? 'Loading…' : String(query.data()?.length ?? 0)}
      </span>
      <button onClick={() => void query.refetch()}>Refresh</button>
    </section>
  )
}
```

- `useQueryClient()` returns the provider's client and throws a diagnosable
  error outside `<QueryClientProvider>`.
- `useQuery(options | () => options)` creates one observer and one signal-backed
  state. The accessors `data`, `error`, `status`, `pending`, `success`,
  `errorState`, `stale`, `isFetching` and `state` are stable; a binding that
  reads one is the only thing that updates.
- `useInfiniteQuery` adds `hasNextPage`, `isFetchingNextPage` and
  `fetchNextPage()`.
- `useMutation` returns `mutate`, `mutateAsync`, `reset`, `cancel` and the same
  state accessors. `cancel()` aborts every in-flight request; a retry reuses the
  same abort signal.

All observers are disposed with their owner, which also removes them from the
cache.

## Route loader coordination

Hold the same `ZeusQueryClient` in the route configuration closure and call
`query({ … , signal: request.signal })`. Components reading the same `queryKey`
hit that cache instead of issuing a second request, and cancelling a navigation
aborts the query through the loader's `request.signal`. Query stays the only
cache; the router does not add a second one.

```ts
const router = createRouter({
  routes: [
    {
      id: 'user',
      path: 'users/:id',
      loader: ({ params, request }) =>
        client.query({
          queryKey: userKey(params.id!),
          queryFn: () => api.getUser(params.id!, request.signal),
          signal: request.signal,
        }),
      element: () => <UserPage />,
    },
  ],
})

function UserPage() {
  const params = useParams()
  const query = useQuery(() => ({
    queryKey: userKey(params().id!),
    queryFn: ({ signal }) => api.getUser(params().id!, signal),
  }))
  // …
}
```

## Optimistic updates

Mutation callbacks receive `{ client }`. The standard pattern is: cancel the
target queries, snapshot and write the optimistic value in `onMutate`, roll back
in `onError`, and invalidate in `onSettled`. The `onMutate` return value is
typed as the callbacks' `context`.

```ts
const save = useMutation({
  mutationFn: ({ id, email }) => api.updateUser(id, { email }),
  onMutate: async ({ id, email }, { client }) => {
    const key = userKey(id)
    await client.cancelQueries({ queryKey: key })
    const previous = client.getQueryData<User>(key)
    client.setQueryData<User>(key, user => (user ? { ...user, email } : user))
    return previous
  },
  onError: (_error, { id }, previous, { client }) => {
    client.setQueryData(userKey(id), previous)
  },
  onSettled: (_data, _error, _vars, _previous, { client }) =>
    client.invalidateQueries({ queryKey: ['admin-users'] }),
})
```

The adapter does not add a second optimistic cache; the query cache is the only
one.
