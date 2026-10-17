# RFC-006：响应式 Primitive、Proxy 与 Owner 契约

## 状态

Accepted

## 目标

固定 Zeus beta 的响应式边界，让编译器、DOM runtime 和 Web Component host 只依赖稳定的 Primitive 语义。内部代理工具可以继续演进，但不能被误认为公共 `createSignal` 契约。

## 公共 Primitive

`@zeus-js/zeus` 和 `@zeus-js/signal` 主入口只承诺以下六个运行时操作：

- `createSignal(initial)` 创建浅值容器；读取 accessor 建立依赖，写入相同 `Object.is` 值不触发更新。
- `createMemo(compute)` 惰性缓存结果。只有依赖版本变化才重新计算；结果未变化时不通知下游。
- `createEffect(run)` 首次同步执行，依赖变化时同步重跑；`batch` 只合并最外层 batch 内的提交。
- `createRoot(run)` 创建 detached owner，返回 `run` 的结果；返回的 dispose 幂等且释放全部子 effect、scope 和 cleanup。
- `onCleanup(fn)` 在当前 effect 下一次执行前运行；若当前没有 effect，则登记到当前 owner，并在 owner dispose 时运行。
- `batch(run)` 在回调返回或抛错后都刷新待处理 effect，并传播原始错误（包括 `undefined`、`null` 等 falsy 值）。

Signal 的值可以是函数，但 setter 的函数参数按 updater 解释；要写入函数值必须使用 `set(() => fn)`。Primitive signal 不会隐式代理对象、数组、Map 或 Set，原地修改这些值不会触发 signal effect。

## Proxy 与集合支持级别

以下能力属于 `@zeus-js/signal/internal`，不是应用代码的公共入口：

| 能力                                | 语义                                               | 稳定范围              |
| ----------------------------------- | -------------------------------------------------- | --------------------- |
| `reactive(object/array)`            | 深层代理；嵌套对象和数组属性、增删和迭代可追踪     | runtime/compiler 内部 |
| `shallowReactive(object/array)`     | 只代理根属性；嵌套值保持原始 identity              | runtime/compiler 内部 |
| `reactive(Map/Set/WeakMap/WeakSet)` | 追踪 `get/has/set/add/delete/clear`、`size` 和迭代 | runtime/compiler 内部 |
| `readonly` / `shallowReadonly`      | 只读诊断和只读代理                                 | runtime/compiler 内部 |
| `state` / `shallowState` / `watch`  | 兼容现有内部实现的组合工具                         | internal only         |

这些 Proxy 能力不改变 `createSignal` 的浅容器规则，也不保证普通对象原地修改能够被 Primitive signal 观察。编译器生成的绑定应优先读取显式 accessor；不能通过检测值类型猜测是否需要执行函数或创建深层代理。

## Owner、cleanup 与异步边界

1. effect 和 child scope 只能登记到创建时仍 active 的 owner。owner 已开始 dispose 后恢复异步 continuation，创建的 effect 立即失效并执行其 cleanup，不得成为孤儿订阅。
2. dispose 先将 owner/effect 标为 inactive，再运行 cleanup；cleanup 重入 dispose 必须幂等。
3. 同一 owner 的 cleanup 按登记顺序执行；一个 cleanup 抛错不能跳过兄弟 cleanup 或子 scope。所有 cleanup 完成后传播第一个错误。
4. effect 重跑先执行上一次 cleanup，再重新收集依赖。cleanup 错误会传播给触发更新的调用方，同时恢复 tracker、owner 和 running 状态。
5. 公共 effect 禁止同步写入自己当前读取的依赖，抛出稳定诊断；不通过静默丢弃更新解决重入。
6. `createRoot` 的 detached owner 不受外部 owner 停止影响，必须由其 dispose 显式释放。

## 禁止事项

- 不把 `alien-signals`、`Dep`、`ReactiveEffect`、Proxy handler 或 owner 对象作为公共类型。
- 不把 primitive signal 改成隐式深响应式，也不通过隐式重执行组件实现更新。
- 不在异步边界恢复已失效 owner 后继续挂载 DOM、订阅 signal 或保留事件监听器。

## 验收

- `packages/core/signal/__tests__/reactivity-contract.spec.ts`：Primitive 浅容器、函数值、memo diamond、分支和 batch。
- `packages/core/signal/__tests__/owner-contract.spec.ts`：nested owner、异步恢复、cleanup 异常、重入与 detached root。
- `packages/core/signal/__tests__/public-reactivity-contract.spec.ts`：Proxy/collection 支持级别与公共入口隔离。
- `pnpm test-unit -- --project unit`（或针对 `packages/core/signal` 的 Vitest project）必须通过。
