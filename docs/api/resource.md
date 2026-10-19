# Resource

`@zeus-js/resource` 提供窄的异步资源原语：状态通过 accessor 读取，请求通过 generation
与 `AbortSignal` 取消，旧请求不能覆盖新请求。

```ts
const resource = createResource(
  () => search(),
  (query, { signal }) =>
    fetch(`/api/search?q=${query}`, { signal }).then(r => r.json()),
  { key: query => query, staleTime: 5_000 },
)

resource.pending()
resource.data()
resource.error()
resource.stale()
```

应在 Zeus owner 内创建资源，以便 source accessor 自动触发重取并在 owner 释放时取消
请求。`dispose()` 可用于显式释放资源。

## 与 ErrorBoundary 集成

Resource 错误不会自动穿透到 `ErrorBoundary`。在边界 child 的绑定中显式读取
`resource.error()` 并抛出原始错误，边界即可切换到 fallback；`refetch()` 成功后调用
fallback 提供的 `reset()` 重新挂载 child：

```ts
render(() => {
  const resource = createResource('key', load)
  return ErrorBoundary({
    children: () => {
      const text = document.createTextNode('')
      bindText(text, () => {
        if (resource.status() === 'error') throw resource.error()
        return resource.pending() ? 'loading' : (resource.data() ?? 'empty')
      })
      return text
    },
    fallback: (_error, reset) => {
      const button = document.createElement('button')
      button.textContent = 'retry'
      button.onclick = () => {
        void resource.refetch().then(
          () => reset(),
          () => undefined,
        )
      }
      return button
    },
  })
}, container)
```

资源应由边界的外层 owner 持有，才能在失败分支销毁后继续 `refetch()`；owner 释放时
资源请求会通过 `AbortSignal` 取消，晚到结果也不会再次提交到已销毁的资源状态。
