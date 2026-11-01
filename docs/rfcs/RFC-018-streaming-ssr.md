# RFC-018：实验性流式 SSR 入口

状态：Proposal（experimental，2026-11-01 随 PR-16 引入）

## 范围

RFC-004 的同步契约不变。`renderToString()` 仍然严格同步：任何层级出现 Promise 或
thenable 立即抛出 `renderToString() does not support async render values.`。

本 RFC 只描述 `@zeus-js/runtime-ssr` 与 `@zeus-js/zeus/server` 中新增的**实验性**入口
`renderToStream()`。它不进入稳定 API 面积，协议以 `SSR_STREAMING_API_VERSION` 版本化；
形状变化时提升版本号，不保留兼容分支（AGENTS.md §2.6）。

## 为什么单独成篇

RFC-004 把 streaming / async SSR 列为非目标，且要求异步协议必须包含背压、取消、安全
和明确的实验性范围。PR-16 的设计包要求 0.2.0 在实验性入口提供真实可用的流式子集。二者
冲突以“另立 versioned RFC”的方式解决：RFC-004 非目标一节指向本文，稳定契约不受影响。

## API

```ts
import { renderToStream } from '@zeus-js/zeus/server'

const stream: ReadableStream<Uint8Array> = renderToStream(() => source(), {
  signal: request.signal,
  flushAt: 8192,
})
```

- 返回标准 `ReadableStream<Uint8Array>`（UTF-8 字节）；可直接交给 `Response` 或
  `stream.pipeTo()`。
- `input` 必须返回一个 SSR node，或一个 `AsyncIterable<SSRNode>`。返回 Promise 立即
  以 `renderToStream() cannot serialize a Promise; await the value before yielding it.`
  拒绝。
- `signal`：`AbortSignal`。中止后停止推进 source、释放请求 scope，并以
  `AbortError` 结束流。已经 `aborted` 的 signal 在调用时同步抛出。
- `flushAt`：最小缓冲字符数，默认 8 KiB。分块发生在转义之后，一个 chunk 不会切开
  已转义的值；chunk 只是传输单位，消费者拼接后再解析。

## 语义

### 真实分块

静态树走与 `renderToString()` 相同的序列化器，按 `flushAt` 切块输出；异步源每 `yield`
一个值就冲刷一次。实现不得用预先切分的静态字符串伪装异步——每个 chunk 都来自当时的
序列化结果。

### 背压

`ReadableStream` 的原生背压即协议：只有 reader 请求下一个 chunk 时才推进 source。
慢消费者会让 async generator 停在 `await` 上，不会无限缓冲。

### 取消

`signal` 中止、reader 调用 `cancel()`，或 source 抛错，都走同一条 `dispose` 路径：
调用 iterator 的 `return()`、释放请求的 reactive root、释放 `SSROwner`。三者都只做一次
（`settled` 守卫），且 cleanup 抛错不得替换流本身的错误。

### 异常中断

source 在冲刷若干 chunk 后抛错时，已输出的 chunk 对 reader 仍可读，剩余流以该错误结束。
不会补写闭合标签，也不会静默截断成“成功”。

### 安全

每个 chunk 使用与 `renderToString()` 相同的转义器：普通文本转义 `&`、`<`、`>`；
`<script>`/`<style>` 遵守 raw-text 规则（含跨 chunk 拼接后的结束标签改写与 script 的
double-escaped state）；attribute 至少转义 `&`、`"`、`<`、`>`。raw-text 内出现
`SSRFragment` 运行时拒绝。`assertStreamNode` 在序列化前遍历 yield 的树，
嵌套 Promise 会得到 streaming 专属错误而不是同步协议错误。

### per-request owner 隔离

每次 `renderToStream()` 调用创建自己的 `SSROwner` 与 `createRoot`。source 的每个同步
片段都在 `runWithSSROwner(owner, ...)` 内执行，因此并发请求的 `provide()` 值互不可见。

**已知边界（有意为之，写入测试）**：`Provider` 的提供链是同步作用域语义。generator
在 `await` 之后恢复时不在提供链内，`useContext()` 只能读到默认值或显式重新提供的值。
需要跨 `await` 的上下文必须在恢复后重新 `provide()`，或把值作为参数传入。这与 DOM
runtime 的 owner 语义一致（owner 不会自动穿过异步边界），文档必须显式说明。

### 与 hydration 的关系

编译器产出的 hydration marker 是逐节点的稳定 ID，chunk 边界不改变它们：拼接后的
HTML 与同步输出一致，显式 `hydrate()` 仍按 marker 复用节点。本 RFC 不引入增量
hydration 或 out-of-order 流。

## 明确不支持的边界（可运行测试覆盖）

| 边界                                       | 行为                                                 |
| ------------------------------------------ | ---------------------------------------------------- |
| render factory 返回 Promise                | `renderToStream()` 拒绝，`TypeError`                 |
| yield 的数组里含 Promise                   | `renderToStream()` 拒绝，`TypeError`（流式专属文案） |
| 把 `AsyncIterable` 传给 `renderToString()` | 同步协议错误（thenable 或类型错误）                  |
| raw-text 内 yield `SSRFragment`            | 运行时拒绝                                           |
| `await` 之后依赖 `Provider`                | 读到默认值；需重新 `provide()`                       |
| 流中抛错后的补全                           | 不补全，流以错误结束                                 |
| 浏览器端消费                               | 原生 `ReadableStream`，无 polyfill                   |

## 版本与实验性

`SSR_STREAMING_API_VERSION = 1`。该常量变化表示 chunk 契约或选项形状发生不兼容变化。
实验期内允许破坏性调整，调用方必须与 runtime 同版本构建（RFC-009）。

## 验证

`packages/core/runtime-ssr/__tests__/streaming.spec.ts` 覆盖：真实 `await` 与 chunk
顺序、pull 驱动的 source 推进（背压）、中止（`AbortError`，source 的 `finally` 仍执行）、
预中止 signal、source 抛错保留已冲刷 chunk、关闭与取消时的 scope 释放、并发请求的
context 隔离、await 边界规则、raw-text 拒绝、hydration marker 连续性与 thenable 拒绝。

流式入口不在浏览器三引擎验证范围内：Node 端 `ReadableStream` 由运行时提供，浏览器
消费属于宿主服务器集成，标 BLOCKED。
