# Query

`@zeus-js/query` 适配 `@tanstack/query-core`，将查询、无限分页和 mutation 状态投影为
Zeus accessor。重试、缓存、去重和查询取消由 query-core 处理。

```ts
const client = createQueryClient()
const users = createQuery(client, {
  queryKey: ['users', page],
  queryFn: ({ signal }) => fetch(`/api/users?page=${page}`, { signal }).then(r => r.json()),
  retry: 2,
})

users.pending()
users.data()
users.error()
await users.refetch()
```

`createInfiniteQuery` 提供 `fetchNextPage()`，`createMutation` 提供 `mutateAsync()`。
在 owner 中创建的 observer 会随 owner cleanup 自动解除订阅；共享 `QueryClient` 由调用方
通过 `dispose()` 释放。
