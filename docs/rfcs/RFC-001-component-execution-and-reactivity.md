# RFC-001：组件执行、响应式与子树生命周期

## 状态

Accepted

## 目标

Zeus 组件只执行一次初始化。初始化创建 DOM、signals、memos、effects 和绑定；后续状态变化只更新具体绑定点，绝不重新执行整个组件或引入 Virtual DOM diff。

本 RFC 同时固定公共响应式接口与 DOM 子树释放规则，使运行时引擎可以替换而不改变用户代码。

## 公共接口

`@zeus-js/zeus` 与 `@zeus-js/signal` 的主入口只公开以下 MVP 响应式接口：

```ts
export type Accessor<T> = () => T
export type Setter<T> = (value: T | ((previous: T) => T)) => T

export function createSignal<T>(initialValue: T): [Accessor<T>, Setter<T>]
export function createMemo<T>(compute: () => T): Accessor<T>
export function createEffect(effect: () => void): void
export function createRoot<T>(run: (dispose: () => void) => T): T
export function onCleanup(cleanup: () => void): void
export function batch<T>(run: () => T): T
```

语义：

- `createSignal` 总是创建浅层值容器。对象和数组不会被隐式转换为深层 reactive proxy。
- setter 接受新值或 updater，并返回最终值。
- `createMemo` 是惰性、缓存、只读 getter。
- `createEffect` 立即执行，并在依赖变化时同步重跑；其内部 runner 不属于公共契约。
- `createRoot` 创建显式 owner/scope，返回回调结果；`dispose` 幂等。
- `onCleanup` 在 effect 重跑前或当前 root/子树释放时执行。一个 owner 内可注册多个 cleanup。
- `batch` 在最外层 batch 结束时统一刷新依赖 effect。

旧的 `state`、`computed`、`effect`、`watch`、`scope`、`untrack`、`nextTick` 不再从公共主入口导出，也不提供 alias。编译器和 runtime 内部可以使用非公共底层原语。

## Owner 与子树生命周期

每次 `render` 创建一个根 owner。动态 DOM 区域创建子 owner，以下资源必须属于同一子树生命周期：

- 已插入的 DOM 节点；
- 子树内创建的 effects、memos 与 cleanup；
- context owner；
- Host/Slot 投影状态和事件/ref 清理。

区域替换顺序固定为：

1. 停止旧子 scope；
2. 执行全部 cleanup；
3. 移除旧 DOM；
4. 在新子 scope 与继承的 context owner 中创建新 DOM。

`Show` 的当前分支、无 key `For` 的每次完整列表实例、keyed `For` 的每个 record 都必须拥有独立子 scope。keyed record 移动时保留 scope，离开列表时立即释放。

## 实现边界

- `alien-signals` 或其他引擎只能位于 `packages/core/signal` 的实现内部。
- `runtime-dom` 只依赖 Zeus 的 scope 接口，不依赖第三方引擎类型。
- DOM 区域与 scope 的成对创建/释放集中在一个内部 module，`Show`、`For` 和动态插入共同复用。
- 不引入普通 `let` 自动响应式、props 隐式转换或组件 rerender fallback。

## 测试策略

- 公共契约测试验证六个导出、类型与旧导出删除。
- signal 单元测试覆盖 getter/setter、updater、memo 缓存、effect cleanup、root disposal 与 batch。
- runtime-dom 测试验证 Show 多次切换时旧分支 effect/cleanup 停止。
- runtime-dom 测试验证无 key For 更新、缩短、清空时旧 item scope 停止。
- keyed For 测试验证移动时不清理、删除时立即清理、父 root 释放时清理剩余 record。
- 所有测试以可观察状态和 DOM 结果为断言，不断言内部调用顺序。

## 验收命令

```sh
pnpm test-unit
pnpm check
pnpm lint
pnpm build
pnpm build-dts
pnpm check:exports
pnpm examples:check:all
```

## 非目标

- store、resource、scheduler/concurrency、SSR 与 hydration；
- 深层 proxy 作为 MVP 公共状态模型；
- 为旧公共接口保留迁移期或 deprecated export。
