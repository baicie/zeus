# RFC-015：Resource / Query Contract

- 状态：Accepted（2026-11-01 修订：QueryClient 作用域与 route loader 协调）
- 日期：2026-10-18（初版）、2026-11-01（Query Context 修订）

## 状态与取消

Zeus 的异步数据 API 对外只暴露 signal accessor，不暴露响应式引擎或第三方
observer。资源状态是 `pending`、`success`、`error` 三态，并附带 `data`、`error`、
`stale` 和 `updatedAt`。每次请求都有独立的 `AbortSignal` 与 generation；只有当前
generation 可以提交结果，旧请求即使晚返回也不能覆盖新状态。

`cancel()` 取消当前请求并保留已有 data；owner 释放时自动调用 `dispose()`，取消未
完成请求并清空资源缓存。调用方需要处理被取消的 Promise rejection，资源 accessor 会
继续保持 `pending`，不会把取消当作业务错误。

## stale 与缓存

资源只有在显式设置 `staleTime` 时才复用内存缓存。缓存命中返回 `success` 且
`stale=false`；过期后重新请求期间可保留旧 data，并报告 `pending=true`、
`stale=true`。对象 source 必须提供稳定的 `options.key`，避免隐式序列化改变请求
身份。

## Query Core Adapter

`@zeus-js/query` 适配 `@tanstack/query-core` 的 `QueryObserver`、
`InfiniteQueryObserver` 与 `MutationObserver`。缓存、去重、重试、分页和 query
cancellation 均由 query-core 负责；adapter 只将 observer result 批量投影到 Zeus
signals，并在 owner cleanup 时解除订阅和销毁 observer。

### 公共类型边界

2026-11-01 裁决（PR-19）：`@zeus-js/query` 不再公开 `@tanstack/query-core` 的
类型或类。公开类型为 Zeus 自有的 `ZeusQueryClient`、`ZeusQueryOptions`、
`ZeusMutationOptions`、`ZeusQuery`、`ZeusMutation`、`ZeusInfiniteQuery`；
`QueryClient` 实例只存在于实现内部，通过 `ZeusQueryClient` 的方法访问。

`ZeusQueryClient` 提供：

- `query(options)`：读取/写入 query cache 并返回 promise，是 route loader 与组件
  共享缓存的原语；
- `getQueryData` / `setQueryData`：同步读取与写入缓存，支持 updater 函数；
- `invalidateQueries` / `cancelQueries` / `removeQueries` / `clear`；
- `dispose()`：取消未完成查询并清空缓存。

### QueryClient 作用域

`QueryClientProvider` 通过 owner context 向子树提供 `ZeusQueryClient`，并在挂载时
调用内部 client 的 `mount()`、卸载时调用 `unmount()`。`mount()` 是引用计数的：
多个 provider 共享同一 client 时，焦点/在线监听只在最后一个 provider 卸载后解除。
Provider 不拥有 client 生命周期，调用方仍通过 `dispose()` 显式释放共享 client。

`useQueryClient()` 在 provider 外调用时抛出可诊断错误。`useQuery(options)` 与
`useMutation(options)` 从 context 读取 client，组件不接收 client 参数。

### 与 route loader 的协调

route loader 在路由配置的闭包中持有同一个 `ZeusQueryClient`，调用
`queryClient.query({ queryKey, queryFn })` 预取并写入 query cache。组件随后用相同
query key 调用 `useQuery`，命中缓存时不会重复请求；loader 的 `request.signal` 传给
`queryFn`，导航取消会中止请求。Query 仍是唯一缓存，Router 不引入第二套全局
cache。

### 乐观更新

`ZeusMutationOptions` 的 `onMutate` / `onError` / `onSettled` 回调收到
`{ client }` helpers。`onMutate` 的返回值是其余回调的第四个（或第三个）参数，类型由
`useMutation<T, V, E, TContext>` 的第四个泛型指定；缺省为 `unknown`。标准模式：

1. `onMutate` 中 `cancelQueries`，快照旧数据并 `setQueryData` 写入乐观值，返回快照；
2. `onError` 中用快照回滚；
3. `onSettled` 中 `invalidateQueries` 让缓存与服务器一致。

该模式由测试覆盖；adapter 不额外提供第二套 optimistic cache。

该契约不承诺 SSR fetch，也不在 Zeus runtime 中实现第二套全局缓存系统。
