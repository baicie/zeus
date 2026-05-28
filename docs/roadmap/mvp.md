结论：**Zeus 的“技术 MVP”基本已经完成了，但“可发布 MVP”还差一轮稳定化。**

我按最新 `feat/signal` 看下来，现在项目已经超过之前 Phase 0~4 的状态，已经做到 **Phase 6 雏形**：有统一 `state()`、compiler JSX 闭环、runtime-dom、Vite 插件、examples、docs、create-zeus、changeset、bench/size 脚本等。根目录脚本已经包含 `build / build-dts / check / lint / test / bench / size / docs / release / examples:check`，workspace 也覆盖了 `packages/*`、`playground/*`、`examples/*` 和 `docs`。

# MVP 完成度评估

| 模块                         |                                        当前状态 | MVP 判断                 |
| ---------------------------- | ----------------------------------------------: | ------------------------ |
| Monorepo / 构建脚本          |                                            已有 | 完成                     |
| signal / state               |                              已有统一 `state()` | 基本完成                 |
| runtime-dom                  |  DOM binding、事件委托、For、Web Component 都有 | 基本完成                 |
| compiler                     | JSX -> runtime helper，physical DOM path 已接入 | 基本完成，但需补回归测试 |
| Vite plugin                  |         已有，已改 dedupe + delegateEvents true | 基本完成                 |
| examples                     |                                  counter 已存在 | 最小完成                 |
| docs / create-zeus / release |                                      骨架已存在 | 初步完成                 |
| 测试稳定性                   |        框架有 Vitest 配置，但关键路径测试需要补 | 未完成                   |
| API 收敛                     |                  主入口暴露过多 internal helper | 未完成                   |

所以我的判断是：

```txt
技术 MVP：80%~85% 完成
可发布 MVP：60%~70% 完成
```

---

# 现在代码最核心的亮点

## 1. Compiler 已经走 Solid 风格 DOM path

现在 `transformJSX()` 已经接入：

```ts
assignDomPaths(ir)
assignPhysicalDomPaths(ir)
```

而且是在 `collectTemplates()` 和 `emitDOM()` 前完成，说明你已经把 “marker 扫描” 优化成 “编译期 DOM 导航路径” 这条线接进主流程了。

IR 里也已经正式有：

```ts
PhysicalDomPath = Root
FirstChild
NextSibling
ChildNode
```

并且 `ElementIR / DynamicTextIR / ComponentIR / ShowIR / ForIR / SlotIR` 都挂了 `physicalDomPath`。

更关键的是，你最新 `emitElement()` 已经做了 DOM ref 依赖闭包：先收集 `refNodeMap`，再递归声明 `FirstChild / ChildNode / NextSibling` 依赖，能避免之前 `_el$2 is not defined` 的问题。

这部分是 Zeus 当前最有价值的核心。

---

## 2. DynamicText 语义已经改对了

现在 `emitDynamicText()` 会创建临时 `textRef`，然后插入到 `node.ref.name` 这个 anchor 前：

```ts
_insert(parent, textRef, node.ref)
_bindText(textRef, () => expr)
```

这说明 `DynamicTextIR.ref` 已经被你实际用成了 **comment anchor ref**，而不是 Text 节点 ref。这个方向是对的。

不过 `lowerExpression()` 里现在还是：

```ts
ref(context.uid('text$').name)
```

语义上建议改成 `anchor$`，不然之后看代码会误导。

---

## 3. Runtime-dom 已经超过 MVP

runtime-dom 现在导出了：

```txt
render / insert / marker / bindings / events / refs / Show / For / defineElement / Host / Slot / createSlot / hostContext
```

这说明普通 DOM、控制流、Web Components、Slot 相关能力都已经有入口了。

事件系统也已经是委托模式：`bindEvent()` 存到 `__zeusEvents`，`delegateEvents()` 在 `document` 注册一次监听。

`mountFor()` 已经支持 key 函数，并且有 keyed diff / move range 的逻辑。

---

## 4. Vite plugin 已经进入可用状态

最新 Vite 插件已经去掉之前错误的 root alias，改成了 `resolve.dedupe`，并且 compiler 选项里 `delegateEvents: true`，这和 runtime 当前的事件委托模型匹配。

这点很重要，因为 runtime 当前 `bindEvent()` 不直接 `addEventListener`，如果没有 `_delegateEvents(["click"])`，事件就不会工作。

---

# 目前还不能说“发布级 MVP 完成”的原因

## 1. `state()` 类型有一个明显不一致

`state.ts` 里 runtime 判断 `Map / Set / WeakMap / WeakSet` 是 proxyable：

```ts
value instanceof Map ||
  value instanceof Set ||
  value instanceof WeakMap ||
  value instanceof WeakSet
```

但类型层面的 `ProxyableInput` 只包含：

```ts
Record<PropertyKey, any> | readonly any[]
```

也就是说：

```ts
const map = state(new Map())
```

运行时会走 `reactive(map)`，但 TS 类型可能推成 `ValueState<Map<...>>`。这是 API 层的明显 bug，建议马上修。

应该改成：

```ts
type ProxyableInput =
  | Record<PropertyKey, any>
  | readonly any[]
  | Map<any, any>
  | Set<any>
  | WeakMap<object, any>
  | WeakSet<object>
```

---

## 2. public API 暴露太宽

`@zeus-js/zeus` 现在导出了大量 runtime internal helper：

```txt
template / insert / child / marker / bindText / bindAttr / bindProp / bindClass / bindStyle / bindEvent / mountShow / mountFor
```

这对开发方便，但对框架主入口不太好。主入口最好只保留用户 API：`state / computed / effect / watch / scope / render / Show / For / Host / Slot / defineElement`。底层 helper 应该留在 `@zeus-js/runtime-dom` 或 `@zeus-js/zeus/internal`。

---

## 3. Compiler 关键路径需要 snapshot 兜底

现在 physical DOM path 是你最核心、也最容易出 bug 的地方。虽然代码已经补了依赖闭包，但必须加 snapshot 覆盖：

```txt
1. counter 场景
2. text 节点占位：hello + {name}
3. 连续动态节点：{a}{b}{c}
4. 嵌套动态节点：section/span/{name}
5. Fragment / Host 展开
6. Show / For / Slot anchor
```

当前 Vitest 配置确实会扫 `packages/**/*.{test,spec}.{ts,tsx}`，bench 也有单独项目，但我建议你把 compiler physical path 的测试作为 P0 补上。

---

# 最新路线图

## Phase A：MVP 稳定化，当前最应该做

目标：让 examples/counter、Show、For、Slot、Web Component 都稳定跑，不再出现 compiler 产物级别的变量缺失。

### Todo

```txt
A1. 修 state(Map/Set) 类型不一致
A2. lowerExpression text$ 改 anchor$
A3. 补 compiler physicalDomPath snapshot
A4. 跑通 examples/counter
A5. 增加 examples/todo，覆盖 For keyed diff
A6. 增加 examples/web-component，覆盖 defineElement + Slot
A7. runtime cleanup 测试：render dispose、event cleanup、For cleanup、ref cleanup
```

这阶段完成后，可以说：

```txt
Zeus 已完成技术 MVP。
```

---

## Phase B：MVP API 收敛

目标：让 API 面向用户更干净，避免内部 helper 变成 public breaking change。

### Todo

```txt
B1. @zeus-js/zeus 主入口只保留用户 API
B2. runtime helpers 仅从 @zeus-js/runtime-dom 导出
B3. signal 主入口是否继续导出 ref/reactive 做决策
B4. 新增 @zeus-js/signal/compat 可选出口
B5. 文档明确 state() 是主状态 API
```

当前 `signal` 主入口仍然导出 compat 的 `ref/reactive`，代码里也写了 “compat — keep existing ref/reactive APIs exported from main entry”。这没问题，但发布前需要明确它们是兼容 API 还是正式 API。

---

## Phase C：Runtime 语义补强

目标：不追求更多 API，先把已有行为讲清楚、测清楚。

### Todo

```txt
C1. For keyed diff 语义测试
C2. 同 key 替换 item 的行为文档化
C3. Show 切换节点清理测试
C4. delegated event currentTarget 测试
C5. bindRef unmount 清空测试
C6. Web Component disconnected cleanup 测试
```

`For` 当前同 key 复用 DOM，但如果 item 被替换成同 key 的新普通对象，旧 DOM 是否更新要非常小心。当前代码只是更新 `oldRecord.item` 和 `oldRecord.index`，不会重新 render 旧 nodes。

短期建议文档规定：

```txt
For keyed 模式下，推荐 item 是 reactive object；
替换同 key 普通对象不保证局部 DOM 更新。
```

---

## Phase D：DX 和发布准备

目标：让别人能装、能跑、能看文档。

你现在 docs 和 create-zeus 都已经有骨架：docs 是 VitePress，create-zeus 也有 bin、build 脚本和模板文件配置。

### Todo

```txt
D1. pnpm create zeus 本地 smoke test
D2. docs/getting-started 完整跑通
D3. examples/counter/todo/web-component 全部 build
D4. pnpm build && pnpm build-dts && pnpm check && pnpm test-unit
D5. size report 输出
D6. changeset release dry-run
```

---

## Phase E：发布后增强

这部分先别急。

```txt
E1. SSR / renderToString
E2. Hydration
E3. Router
E4. Resource / Suspense
E5. DevTools UI
E6. HMR 状态保留
```

这些都不是当前 MVP 的必要项。

---

# MVP 判定

我建议把 MVP 标准定义成：

```txt
1. counter example 能跑
2. todo example 能跑，For keyed 能更新
3. Show 能切换
4. input ref 能工作
5. Vite plugin 能编译 TSX
6. compiler 默认不生成 marker(parent,index)，而是生成 firstChild/nextSibling/childNodes
7. pnpm build / check / test-unit 通过
8. @zeus-js/zeus 暴露干净用户 API
```

按这套标准看：

```txt
功能闭环：基本完成
稳定性测试：未完成
API 收敛：未完成
发布准备：部分完成
```

所以最终判断：

```txt
Zeus 当前已经完成“技术 MVP 原型”
但还没有完成“可发布 MVP”
```

---

# 你现在下一步最推荐的提交顺序

```txt
1. fix(signal): align state Map/Set types with runtime behavior
2. refactor(compiler): rename DynamicText generated ref from text$ to anchor$
3. test(compiler): add physical DOM path snapshots
4. test(runtime-dom): add event/ref/render/For cleanup tests
5. docs: define MVP API surface
6. refactor(zeus): narrow public exports
7. example: add todo and web-component smoke examples
```

做完这 7 个，Zeus 就可以进入：

```txt
v0.1.0-alpha
```

这个版本定位可以是：

```txt
Compiler-first fine-grained JSX framework experimental alpha.
```

不要现在就追 SSR、Router、DevTools。你现在最值钱的是 compiler + runtime 这条路径，先把它打磨稳。
