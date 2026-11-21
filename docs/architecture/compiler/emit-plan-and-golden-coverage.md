# EmitPlan 的约束力度与 Golden 覆盖缺口

对应 TASK B 与 TASK C。测量于 `f07c0375`。

---

## 第一部分：EmitPlan 到底约束了什么

### 1.1 字段与真实守卫的对应

`EmitPlan`（`codegen/emit_plan.rs`）有五个字段。逐个核对它**是否真的**决定了对应段落：

| 字段               | 段落                  | 实际守卫位置                                  | 由 EmitPlan 决定？ | 判定         |
| ------------------ | --------------------- | --------------------------------------------- | ------------------ | ------------ |
| `runtime_import`   | runtime import        | `codegen/mod.rs:128` `if plan.runtime_import` | **是**             | 唯一真实读取 |
| `templates`        | `const $zeusTmpl`     | 无守卫；`emit_templates` 对空集合自然不写     | 否                 | 与事实一致   |
| `components`       | 组件体                | 无守卫；`emit_components` 对空切片自然不写    | 否                 | 与事实一致   |
| `delegated_events` | `delegateEvents([…])` | `emit_delegated_events` 内 `is_empty()`       | 否                 | 与事实一致   |
| `hmr`              | HMR state             | `emit_hmr_state` 的 `Option<&HmrModule>`      | 否                 | 与事实一致   |

**结论：五个字段里只有一个（`runtime_import`）被真正读取。** 其余四个是
"计划值"与"函数自身守卫"并行存在——两者当前一致，但**没有任何东西保证
它们继续一致**。

这不是缺陷，是 EmitPlan 的设计选择，文档头已写明："the other sections are
guarded by their own functions having nothing to write, which is the same
answer and costs no second condition to keep in sync." 记录在这里是为了
让下一个人知道：**改 `EmitPlan::for_module` 的四个非 runtime 字段不会改变
任何输出**。它是一个描述，不是开关。

### 1.2 一个真实的错位：HMR boundary 不受 `plan.hmr` 约束

TASK B 要求检查"是否存在未经 EmitPlan 决策的重复判断"。找到一处：

```
plan.hmr        = hmr_module.is_some()          // 需要 passes::hmr::prepare 产出计划
emit_hmr_boundary 的守卫 = !disposers.is_empty()  // 只需要有 render_calls
emit_hmr_state  的守卫 = hmr_module.is_some()   // 与 plan.hmr 相同
```

`hmr_module` 来自 `passes::hmr::prepare`，它要求**同时**满足：

1. 至少一个顶层 `render(...)` 调用（或变量声明里的）；
2. 至少一个字符串字面量绑定槽（`rewrite_expression` 只接受
   `Expression::StringLiteral`）。

而 `disposers` 只要求条件 1。

**可观测后果**：一个含顶层 `render(...)` 但没有任何字符串字面量绑定的模块，
会得到 HMR boundary（`_zeusHmrDisposers`、`import.meta.hot.accept()`、
`dispose` 回调），但**没有** HMR state。这正是 `plan.hmr == Absent` 而
boundary 已发射的情形。

这是**有意的**：state 承载字面量热替换，boundary 承载 effect 清理，两者
本就是不同承诺。但它们共用 `plan.hmr` 一个字段，导致该字段无法回答
"boundary 会发射吗"。文档头说"the guard that was previously implicit"是
runtime import，因此 HMR 从未承诺由 EmitPlan 决定——**记录，不改代码**。
把它拆成 `hmr_state` / `hmr_boundary` 两个字段会增加一个没有读取者的字段，
与 TASK 05 "仅当有真实重复决策或不一致风险时才修改" 不符。

### 1.3 模板插入位置：`preamble_end` 不含 import

`emit_module` 从 `module.preamble_end` 开始切分源码，而 `preamble_end` 只覆盖
`"use strict"` 指令与 hashbang：

```rust
let preamble_end = parsed.program.directives.last()
    .map(|n| n.span.end)
    .or_else(|| hashbang...)
    .unwrap_or_default();
```

**不含 `import` 语句。** 因此生成的 `import { … } from "runtime"` 与
`const $zeusTmpl = …` 会插在用户自己的 `import` 之前：

```js
import { template as $zeusTemplate, … } from "@zeus-js/runtime-dom";
const $zeusTmpl = /* @__PURE__ */ $zeusTemplate("<div><!></div>");
import { render, For } from '@zeus-js/zeus'      ← 用户源码，被推到后面
export function App(p) { … }
```

这是**合法的 ESM**（import 声明提升），且模板不依赖用户 import 的绑定，所以
运行时正确。它解释了为什么早期基于文本 marker 的顺序表错了三次：真实顺序
是"生成的段落在前，用户源码按原偏移插入"，而不是"用户 import 之后"。

### 1.4 反事实：交换两个段落

把 `emit_templates` 与 `emit_components` 的调用对调，输出变成：

```js
export function App(p) {
  return (() => { … })()const $zeusTmpl = /* @__PURE__ */ $zeusTemplate("<div…>");
```

**不是行为错误，是语法错误**（`})()const`）。`tests/emit_order.rs` 的
`the_runtime_import_precedes_the_templates_and_the_component_body` 失败，
符合 TASK 05 的要求。

但反事实也暴露了旧测试的不足：5 条位置断言里只有 1 条抓住这次交换。
因此本轮加入**可解析性断言**——每个 fixture 的输出必须能被 Oxc 解析为
ES 模块。交换模板与组件段时，这条断言会失败，而不依赖某个 fixture 恰好
同时含模板与组件。

---

## 第二部分：Golden 覆盖的真实缺口

### 2.1 45 个 fixture 里有 9 个从未产出代码

| fixture              | 诊断                                     | 本应覆盖什么           |
| -------------------- | ---------------------------------------- | ---------------------- |
| `async-tsx`          | `ZEUS_ASYNC_COMPONENT`                   | 拒绝路径（正确）       |
| `module-css`         | `ZEUS_UNSUPPORTED_SOURCE_TYPE`           | 拒绝路径（正确）       |
| `show-tsx`           | `ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE`   | **Show 发射**          |
| `for-tsx`            | `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION` | **For 发射**           |
| `for-index-tsx`      | `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION` | **For 索引发射**       |
| `show-in-for-tsx`    | `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION` | **嵌套控制流**         |
| `error-boundary-tsx` | `ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE`   | **ErrorBoundary 发射** |
| `transition-tsx`     | 无（空代码但无诊断）                     | **Transition 发射**    |
| `ssr-flow-tsx`       | `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION` | **SSR 控制流**         |

### 2.2 根因：内置节点必须先 import

`<Show>` 只有从运行时模块 import 后才被识别为内置节点。不 import 时它走
普通组件路径，其 JSX 形式的 `fallback` 作为"组件 prop 里的 JSX 值"被
`ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE` 拒绝。

```jsx
// 无 import —— 走组件路径，被拒绝
export const App = p => (
  <Show when={p.o} fallback={<p>c</p>}>
    …
  </Show>
)

// 有 import —— 走内置路径，正常发射
import { Show } from '@zeus-js/runtime-dom'
export const App = p => (
  <Show when={p.o} fallback={<p>c</p>}>
    …
  </Show>
)
```

**这 6 个 fixture 不是覆盖控制流发射，而是在覆盖"误把内置当组件"的拒绝。**
它们的名字与内容不符，且因为 fixture 确实记录了一个稳定输出，测试一直是
绿的。

`transition-tsx` 是同一根因的另一种表现：它含 `name="fade"`，而 `name`
不是 `Transition` 接受的属性（允许的是 `when`/`enter`/`leave`/`onEnter`/
`onLeave`/`duration`/…）。缺 import 时这个错误被掩盖；补上 import 后会得到
`ZEUS_INVALID_BUILTIN_USAGE`。

`define-element-tsx` 用 `Host` 但未 import——它**能**编译，因为
`defineElement` 的工厂回调把 `Host` 视为该上下文的根，不依赖 import。
这一项不算缺口，但补上 `Slot` 具名投影后覆盖面更完整。

### 2.3 本轮修正

修正而非新增——TASK 06 要求"不得仅为增加 fixture 数量而重复覆盖"。
这 9 个 fixture 已有正确的位置与文件名，问题在输入。

| fixture                  | 修正                                     | 现在验证什么                                          |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------- |
| `show.tsx`               | 加 `import { Show }`                     | Show 区域挂载 + JSX fallback 发射                     |
| `for.tsx`                | 加 `import { For }`                      | For 区域挂载 + 每项子树                               |
| `for-index.tsx`          | 加 `import { For }`                      | 索引访问器 `index()` 的发射                           |
| `show-in-for.tsx`        | 加 `import { For, Show }`                | For 内部嵌 Show 的区域嵌套                            |
| `error-boundary.tsx`     | 加 `import { ErrorBoundary }`            | 渲染函数 fallback 的发射                              |
| `transition.tsx`         | 加 import，`name` → `enter`/`leave` 对象 | Transition 选项对象与挂载调用                         |
| `ssr-flow.tsx`           | 加 `import { Show, For }`                | SSR 侧 Show/For 的字符串发射                          |
| `ssr-error-boundary.tsx` | 加 `import { ErrorBoundary }`            | SSR **正确拒绝**（原因从"缺 import"变为"SSR 不支持"） |
| `define-element.tsx`     | 加 `<Slot name="heading">`               | Host + 具名 Slot 投影                                 |

**8/9 现在产出代码**，`ssr-error-boundary` 仍为空但诊断换成
`ZEUS_INVALID_ERROR_BOUNDARY_FALLBACK`——这才是它名字声称的"SSR 拒绝
ErrorBoundary"。

### 2.4 拒绝路径没有丢失

原先被这 6 个 fixture 意外覆盖的"误命名内置节点"行为，现在由
`tests/diagnostics.rs::an_unimported_builtin_is_treated_as_an_ordinary_component`
显式钉住，两种形态都断言。

### 2.5 仍然缺的覆盖（本轮未补，明确记录）

| 缺口                     | 为什么重要                                     | 为什么未补                 |
| ------------------------ | ---------------------------------------------- | -------------------------- |
| 嵌套 Fragment 的多层混合 | 本轮的 `tests/fragment.rs` 已覆盖 3 层         | 已覆盖，不需 golden        |
| SSR + autoHydrate 交叉   | 两个开关同时开启的 marker 序列                 | 需要先确定该组合是否受支持 |
| HMR 的 `manual_boundary` | 已有 `hmr-manual.tsx`                          | 已覆盖                     |
| 诊断的 span 精度         | `tests/diagnostics.rs` 只断言 `span.is_some()` | 精确偏移属于另一个测试类别 |

---

## 3. 本轮结论

- **EmitPlan 是描述，不是开关。** 五个字段中只有 `runtime_import` 被读取。
  这符合其文档，但意味着修改另外四个字段不会改变输出。
- **发现一处真实的字段错位**：`plan.hmr` 无法回答"boundary 会发射吗"，
  因为 state 与 boundary 的触发条件不同。已记录，未改代码——拆字段会
  增加没有读取者的字段。
- **发现一处真实的位置事实**：`preamble_end` 不含 import，生成段落插在用户
  import 之前。合法，但推翻了旧的基于文本 marker 的顺序表。
- **发现覆盖缺口**：9/45 fixture 从未产出代码，其中 7 个是控制流。根因是
  内置节点缺 import。已修正 9 个 fixture 的输入，8 个开始真正覆盖发射。
- **反事实验证成立**：交换模板与组件段使输出语法非法，位置断言失败；
  新增的可解析性断言提供第二重保护。
