# Resource

`@zeus-js/resource` 提供窄的异步资源原语：状态通过 accessor 读取，请求通过 generation
与 `AbortSignal` 取消，旧请求不能覆盖新请求。

```ts
const resource = createResource(
  () => search(),
  (query, { signal }) => fetch(`/api/search?q=${query}`, { signal }).then(r => r.json()),
  { key: query => query, staleTime: 5_000 },
)

resource.pending()
resource.data()
resource.error()
resource.stale()
```

应在 Zeus owner 内创建资源，以便 source accessor 自动触发重取并在 owner 释放时取消
请求。`dispose()` 可用于显式释放资源。
