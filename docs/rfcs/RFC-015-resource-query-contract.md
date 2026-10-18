# RFC-015：Resource / Query Contract

## 状态与取消

Zeus 的异步数据 API 对外只暴露 signal accessor，不暴露响应式引擎或第三方
observer。资源状态是 `pending`、`success`、`error` 三态，并附带 `data`、`error`、
`stale` 和 `updatedAt`。每次请求都有独立的 `AbortSignal` 与 generation；只有当前
generation 可以提交结果，旧请求即使晚返回也不能覆盖新状态。

`cancel()` 取消当前请求并保留已有 data；owner 释放时自动调用 `dispose()`，取消未完成
请求并清空资源缓存。调用方需要处理被取消的 Promise rejection，资源 accessor 会继续
保持 `pending`，不会把取消当作业务错误。

## stale 与缓存

资源只有在显式设置 `staleTime` 时才复用内存缓存。缓存命中返回 `success` 且 `stale=false`；
过期后重新请求期间可保留旧 data，并报告 `pending=true`、`stale=true`。对象 source 必须
提供稳定的 `options.key`，避免隐式序列化改变请求身份。

## Query Core Adapter

`@zeus-js/query` 适配 `@tanstack/query-core` 的 `QueryObserver`、`InfiniteQueryObserver`
与 `MutationObserver`。缓存、去重、重试、分页和 query cancellation 均由 query-core
负责；adapter 只将 observer result 批量投影到 Zeus signals，并在 owner cleanup 时解除
订阅和销毁 observer。QueryClient 的生命周期由调用方拥有，`disposeQueryClient()` 会取消
未完成查询并清理缓存。

该契约不承诺 SSR fetch，也不在 Zeus runtime 中实现第二套全局缓存系统。
