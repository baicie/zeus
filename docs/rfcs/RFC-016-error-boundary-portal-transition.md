# RFC-016：ErrorBoundary、Portal 与 Transition 契约

- 状态：Proposed（E-004 最小契约切片）
- 日期：2026-10-19
- 依赖：RFC-001、RFC-006、RFC-008、RFC-011、RFC-015
- 实现范围：Native Portal runtime；ErrorBoundary 与 Transition 先冻结契约

## 摘要

E-004 需要把错误恢复、跨目标 DOM 挂载和离场动画放进同一套 owner/scope
生命周期里。本 RFC 只承诺细粒度 DOM runtime 能够实现的语义，不引入 Virtual DOM、
组件重新执行或隐式 Promise 渲染。

本切片交付 Native Portal 的最小实现和 cleanup 回归。ErrorBoundary 需要 compiler
把边界 children 降低成显式 render factory，Transition 需要延迟子树 scope 销毁；两者
在这些前置条件稳定前只保留契约和测试设计，不导出半成品公共 API。

## 1. ErrorBoundary

### 1.1 边界输入

目标 API 形态为：

```ts
interface ErrorBoundaryProps {
  // 必须是显式 render factory，避免 JSX 值在边界调用前已经求值。
  children: () => JSXValue
  fallback: (error: unknown, reset: () => void) => JSXValue
  onError?: (error: unknown) => void
}
```

`<ErrorBoundary><Child /></ErrorBoundary>` 在当前 TSX 语义下不能承诺捕获 `Child`
初始化错误：普通 component children 是 JSX 值，不是默认惰性函数（RFC-008）。只有
compiler 为 ErrorBoundary 建立专用 boundary lowering 后，边界才可以接管 child 的
render factory。未完成 lowering 前，调用方应显式传入 factory 形式，测试也必须使用
该形式。

### 1.2 捕获范围和恢复

- 捕获 child factory 调用、子树初次插入和该边界拥有的动态 render effect 的同步错误。
- 不捕获事件处理器错误、独立 owner 的错误或未观察的 Promise rejection。
- `fallback` 在新的子树 scope 中挂载；fallback 自身抛错继续传播到最近外层边界或
  `render()` 调用方，不递归吞错。
- 一次失败只调用一次 `onError`。`reset()` 先停止失败子树并移除其节点，再重新
  执行 child factory；重试失败按新的错误再次通知。
- 边界销毁时先停止 child/fallback effect，再移除节点。错误恢复不能遗留 effect、
  listener、ref 或 Portal target 节点。

### 1.3 Resource 错误

`createResource` 的 `error()`、`status()` 和 `refetch()` 是资源契约。资源失败不会
自动穿透到 ErrorBoundary；边界 child 必须显式读取错误并选择错误 UI，或在明确的
render factory 中抛出该错误。`refetch()` 的 reject 仍由调用方处理，边界不能把异步
Promise 当作 JSX child。

最小验收需要覆盖：pending → error 的状态发布、错误 UI 显示、重新 refetch 成功后的
恢复，以及边界/owner 销毁后请求取消和 cleanup 顺序。

## 2. Portal

### 2.1 Native API

```ts
interface PortalProps {
  target: Element | DocumentFragment
  children: JSXValue | (() => JSXValue)
}

function Portal(props: PortalProps): Comment
```

本切片的 `Portal` 只在 Zeus Native DOM runtime 中提供：

- `target` 必须存在，并且与创建源占位符的 `ownerDocument` 相同；不接受 selector、
  动态 target、跨 document target 或 `null`。
- 源树插入一个 comment 占位符；target 插入 start/end comment 锚点，children 只插入
  两个锚点之间。
- Portal 只拥有自己插入的节点和锚点。销毁时停止 Portal 子树 scope，然后移除自身
  range；不能清空 target，也不能删除其他 owner 的节点。
- children factory 的更新沿用 `ScopedSubtree` 的 owner/Host context 和子树 scope；
  替换时先销毁旧子树，再插入新值，保持现有动态区域的错误和 cleanup 语义。
- target 被移出文档时不触发额外 observer；target 重新连接后节点随 target 保持。跨
  Web Component runtime、React/Vue Portal/Teleport 由 RFC-011 的 Renderer Adapter
  接管，Native Portal 不观察或回收外部 renderer 的节点。

非法 target、不同 document 或缺少活动 render scope 必须同步抛出稳定的
`ZEUS_PORTAL_TARGET_INVALID` / `ZEUS_PORTAL_SCOPE_REQUIRED` 错误。Portal 不在
`runtime-ssr` 导出；SSR/静态字符串渲染不能序列化 Portal。

### 2.2 测试矩阵

- 静态 children 插入 target，源树保留占位符，target 中保留其他兄弟节点。
- 响应式 children 替换保持 target 锚点和节点顺序。
- render disposer、父 scope stop、target disconnect/reconnect 都只清理 Portal
  自己的节点和 effects。
- null、不同 document、非 Element/DocumentFragment 和无活动 scope 的诊断。

## 3. Transition

Transition 在实现前先冻结以下行为，避免把现有 `ScopedSubtree.replace()` 的立即
销毁语义改成不可逆的隐式调度：

- compiler 识别 `Transition` 边界并生成一个拥有稳定 range 的动态区域；普通组件名
  不能自动获得该语义。
- enter 在新节点插入后执行，leave 在节点从 DOM 移除前执行；leave 完成后才停止
  子树 scope 和移除节点，节点 identity 在动画期间保持。
- 每个 range 必须有可取消的 enter/leave 状态；快速重入、重复 `done()`、父 scope
  dispose 都必须幂等。没有 `transitionend`/`animationend` 的环境要有显式完成或
  超时兜底。
- reduced-motion 和 SSR 只输出静态内容，不启动浏览器动画。Transition 不负责
  focus、Escape、Portal target 或跨框架 renderer 生命周期。

该切片不导出 `Transition` runtime，也不修改 compiler IR。后续实现必须先补充
transition 状态机和真实浏览器时序测试，再更新本 RFC 状态。

## 4. 非目标与诊断

- 不实现自动 Promise/Suspense、全局错误捕获、事件错误重试或 hydration。
- 不保留旧 runtime 的兼容 alias；API 名称和错误码在 Beta 阶段直接收敛。
- `ZEUS_PORTAL_TARGET_INVALID`、`ZEUS_PORTAL_SCOPE_REQUIRED` 只描述调用边界；child
  render 错误应保留原始异常，供 ErrorBoundary 或上层 `render()` 处理。
