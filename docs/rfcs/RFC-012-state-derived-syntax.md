# RFC-012：State/Derived 语法糖边界

- 状态：Proposal
- 任务：S-010
- 范围：编译期语法设计；本 RFC 不实现新的语法转换

## 目标

Zeus 可以在显式运行时 primitive 之上提供可选的 `$state`、`$derived` 和
`$effect` 语法糖。语法糖必须降级到现有的 `createSignal`、`createMemo`、
`createEffect`、`createRoot` 和 `onCleanup` 语义，不能改变组件只初始化一次的模型，
也不能把普通 JavaScript 变量隐式变成响应式变量。

```tsx
let count = $state(0)
const doubled = $derived(count * 2)
$effect(() => console.log(doubled))
```

## 作用域与捕获

编译器为每个启用语法糖的模块建立显式的 state scope。`$state` 绑定只能在其
声明 scope 内通过 getter/setter 访问；`$derived` 捕获的 `$state` 和其他
`$derived` 读取在 memo 内重新执行。嵌套函数可以捕获绑定，但捕获的是 accessor
语义，不是初始化时的值快照。

以下情况必须产生诊断或要求显式 API：

- 普通 `let`、参数和 import 不因被 `$derived` 读取而自动响应式。
- 跨模块引用不隐式生成 snapshot 或代理；模块边界使用显式 signal/accessor。
- 在 `$effect` 外异步恢复已销毁 owner 时，不得重新挂载 effect 或订阅。

## 写入、递增与解构

`$state` 的直接赋值和 `++`/`--` 必须降级为对应 setter，并保留 JavaScript
求值顺序与返回值。复合赋值先读取当前值，再按原运算符写入。

```ts
count += step
count++
```

解构只在编译器能够保留 accessor 的位置接受。对象或数组解构到普通变量会形成
初始化快照；需要响应式字段时必须显式使用 `$derived(() => state.field)` 或
其他 accessor。rest、默认值和重命名不得悄悄改变这一规则。

## 逃逸、嵌套对象与导出

嵌套对象默认遵循 `createSignal` 的浅值语义：原地修改不会自动触发更新。未来若
采用深层 `$state`，必须单独定义 Proxy 语义、identity、Map/Set 支持和 cleanup，
不能由语法糖猜测值类型。

当 `$state` 或 `$derived` 作为参数、返回值、对象字段或闭包值逃逸时，生成代码
必须明确逃逸的是 accessor、setter 还是当前值。禁止把 accessor 自动序列化成
普通值，也禁止在 JSX、事件或 component prop 边界隐式调用函数。

公共导出默认导出值语义。导出响应式能力必须显式导出 accessor/setter 或一个
公共 primitive；编译器不为 `export let state` 创建跨模块隐式 snapshot。

## HMR 与 SSR

HMR 只允许对能证明 state identity 与 owner 兼容的编辑复用现有 scope；无法证明
时完整 dispose 并重新初始化。HMR 不得通过模块级隐藏变量跨版本恢复普通 JS 快照。

SSR 只执行一次初始化与可序列化读取，不建立浏览器 effect，也不把 accessor 或
setter 写入 HTML。hydration 若未来支持，必须由独立 RFC 定义 marker、identity
和 mismatch 行为。

## 测试矩阵与拒绝案例

实现前必须先建立下列测试矩阵：单次读取、多个 derived、diamond 依赖、赋值和
递增返回值、嵌套闭包、函数参数、对象/数组解构、rest/default、返回值/对象字段
逃逸、跨模块 import/export、HMR 重载、SSR 无 DOM 执行，以及 owner dispose 后的
异步 continuation。

编译器应拒绝：普通 `let` 的隐式响应式、跨模块隐式 snapshot、无法确定语义的
深层对象变更、在已销毁 owner 中恢复的 effect、把 `$state` 直接用于不支持的
JSX 动态 region，以及会改变函数调用/事件 receiver 语义的隐藏重写。

在该 RFC 被采纳并完成上述契约测试前，用户代码继续使用显式
`createSignal/createMemo/createEffect`。任何语法糖实现都必须生成同一套运行时
primitive，而不是新增公共响应式引擎。
