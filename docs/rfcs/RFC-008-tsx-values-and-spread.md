# RFC-008：TSX 表达式值与有序 Spread

日期：2026-10-17。状态：Accepted。范围：Native DOM、Native Component、动态 children 区域、对应 SSR codegen；不包含完整 Hydration。

## 表达式契约

JSX 表达式产生普通 JavaScript 值；编译器建立读取表达式的外层 getter，不能因为表达式恰好是函数就调用它。移除旧 `ExpressionForm.getter` 和自动执行箭头函数的行为，不提供 legacy 开关。表达式形态仅区分 `value`、`function`、`member`，后两者用于明确的语法上下文与事件 receiver 处理，不代表读取函数。

| 位置           | 输入                             | 行为                                   |
| -------------- | -------------------------------- | -------------------------------------- |
| 文本           | `{count()}`                      | 响应式读取当前值                       |
| 普通 attribute | `title={label()}`                | 外层 getter 读取并序列化值             |
| property       | `prop:formatter={format}`        | 返回函数本身，挂载时不调用             |
| component prop | `<Child value={count()} />`      | 动态属性 getter，保留父到子更新        |
| event          | `onClick={handler}`              | 仅事件触发时调用，member 保留 receiver |
| ref            | `ref={node => ...}`              | 传入节点，替换或卸载时传 null          |
| For callback   | `{item => <li>{item.name}</li>}` | 编译器控制流上下文消费 callback        |

直接函数 child、普通 attribute 的箭头函数有带 source span 的编译诊断。通过 identifier 或运行时值传来的函数也在 DOM text/attribute 与 SSR 边界拒绝，避免函数源码被输出。函数 property、component prop 和 event/ref 保留函数 identity。旧代码 `title={() => label()}` 应直接写 `title={label()}`。

### 内置控制流与宿主节点

`Show.when` 和 `For.each` 是值位置，不是隐式 getter 位置。响应式读取必须在
JSX 中显式调用 signal，例如 `when={visible()}`、`each={items()}`；直接传入
函数值会在编译器可判定时产生 `ZEUS_FUNCTION_BUILTIN_VALUE`，运行时也会拒绝，
不会把函数当作 truthy 条件或空列表。`Show`/`For` 仅接受各自声明的属性，未知或重复
属性会产生 `ZEUS_INVALID_BUILTIN_USAGE`，不会被静默忽略。

`Show` 的 children/fallback 与普通 component `children` 都是 JSX 值；编译器会在
控制流边界内部建立分支工厂，用户不传 getter。只有 `For` 的 item callback 由
编译器控制流消费。普通 JSX child 中的函数、Promise、Symbol 和非 Node 对象值在 DOM/SSR 边界会报错，
不会隐式字符串化；动态区域先完整校验新值树再替换已挂载节点。`Slot.name` 必须是静态字符串（省略表示
默认 slot）；动态表达式、函数和 `prop:` 命名空间都不是 Slot 的迁移语义，编译器
会报告 `ZEUS_INVALID_SLOT_NAME`。Host 只能使用显式宿主属性，不能通过 spread
改变内置边界。普通函数组件的 prop 名是 JavaScript key，`className` 等名称不做
DOM alias 归一化；Native DOM 与 Host 属性才使用 DOM alias。

普通显式事件（如 `onClick={handler}`）在组件初始化时建立一次绑定并保留该
handler identity；需要随着响应式对象替换事件处理器时使用 Native JSX Spread，
其事件键会在提交时移除旧 listener 并挂载新 listener。

## IR 与有序层

新增 `SpreadBinding`，持有 `id`、`target: native | component`、`expr`、`span`。它和显式属性一起保存在原有顺序数组里。Rust 的 Component props 改为有 `kind` 的 `ComponentProp | SpreadBinding`，不使用空属性名等隐式 sentinel。Rust/TypeScript IR round-trip 验证禁止重复 kind 字段。

```tsx
<div {...base()} id="fixed" {...later()} />
<Child {...base()} value={count()} />
```

DOM 目标分别降为：

```ts
bindSpread(element, [() => base(), () => ({ id: 'fixed' }), () => later()])
createComponent(
  Child,
  mergeProps([
    () => base(),
    () => ({
      get value() {
        return count()
      },
    }),
  ]),
)
```

没有 Spread 的元素继续使用静态模板及已有精确绑定，不增加通用属性 diff。存在 Spread 的元素使用一个有序区域，后面的同名属性覆盖前面的属性，class/style 按覆盖处理，不隐式合并。

## Native DOM 提交

- 首次按源码顺序求 source 及其可枚举自有字段；`once(expr)` 层在首次轮到该层时 untrack 并缓存，不能抢先执行。
- 每个 source 用惰性 memo 缓存表达式，内部字段通过实际读取的 Proxy/getter 追踪；普通对象原地修改不自动通知。
- `className` 与 `class`、大小写 event 名称先归一化；同 key 以最后出现的位置参与提交，保留 attribute/property 可能影响同一 DOM 状态时的先后关系。
- 读取快照在 effect 内完成；DOM 写入、ref callback、custom element setter 在退出 effect 后同步提交。提交期间产生的信号更新在返回前继续刷新；最多 100 轮，循环写入抛明确错误并释放绑定资源。
- 删除缺失 key；普通 attribute/class/style 走已有序列化及 patch 逻辑，property 保留值和函数 identity；event 更换时移除旧 listener，ref 更换时先传 null 再挂新 ref。
- ref 或 setter 同步释放 owner 后立即停止后续提交。异常时停止 effect、移除 listener 并清空已挂载 ref；root disposal 后不会恢复监听。
- Spread 拒绝 `innerHTML`、`outerHTML`、`textContent`、`children` 这类会改写受管理子树的 key；event/ref 不降为普通 attribute。

Spread 的预算与明确绑定不同：每轮处理 source/key 集合，并对最终 key 进行有序提交；attribute/style helper 与 property 的值比较跳过冗余写入。大对象 Spread 的代价应由消费者控制，敏感热路径仍优先使用明确绑定。本纵切不宣称任意大范围 Spread 与单点绑定有相同性能。

## Component props

`mergeProps` 返回只读 Proxy；`get`、`has`、`ownKeys` 和 descriptor 查询都读取当前 source 层。存在且值为 undefined 的后层 key 仍覆盖前层；删除后才回退到前层。可枚举 getters 不变成 setup 快照，source identity 改变和同 identity 的响应式字段变化都能被子组件绑定追踪。getter 与枚举只使用自有可枚举键，支持 symbol，避免继承属性意外进入 props。

组件初始化仍只执行一次；props 的 key/value 更新不会触发组件 rerender。子组件应在绑定或 accessor 内读取动态值，普通解构不会自动变响应式。

## SSR

SSR 使用 `ssrSpread` 和相同的覆盖/归一化策略，source 表达式与字段 getter 按源顺序交错执行。attribute 与可序列化 property 在一个有序序列中解析，false/undefined 的删除保留为内部删除项，避免后续删除被省略后让早先 property 重新出现。

事件与 ref 不在服务端执行或输出。attribute 名称按 DOM XML Name 语法验证，值继续转义。只能输出有等价 HTML 表达的 property；不能把函数、对象 property 偷换成 HTML 字符串。不支持的 property 沿用明确的 SSR 错误。SSR 没有引入 DOM globals。

## 诊断边界与验证

Host、Slot、Show、For 仍是编译器内置节点，当前要求明确属性，Spread 给结构化错误。包含 JSX 的 Spread 表达式继续报不支持的动态区域诊断，不残留未编译 JSX。

验证覆盖 Rust IR/代码生成/source map、DOM/SSR helper、真实 N-API + Vite 执行。关键行为包括函数 property 不被误调用、组件 setup 一次、DOM identity 保留、覆盖/删除/动态 keys、event/ref 替换和清理、ref 中的信号写入/同步卸载、`once(expr)` 顺序、SSR 名称注入与 attr/property 顺序，以及 generic defineElement 的括号 Host 根识别。
