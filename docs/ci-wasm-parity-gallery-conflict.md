# main CI 红灯：gallery.tsx 触发 WASM/native 嵌套预算分歧

日期：2026-11-13
main：`224e3aec`（P11 三个 PR 合并后）
Run：43352571913，失败 job `rust-compiler`，失败步骤 `WASM compiler parity with the native compiler`

> **2026-11-13 更正。** 本文第一版说这是"两个编译器刻意用不同预算"的设计取舍，
> 并列了三条改法让维护者选。**那个判断是错的。** 实测证明根因是预检扫描器的
> 缺陷：带属性值的 JSX 标签会让每个子元素把成本累加到父级脊柱上，与嵌套深度
> 无关。已修复，见 §3。下面保留排除过程，因为它解释了为什么最初看错了。

---

## 1. 失败是什么

```
✖ examples/admin/src/gallery.tsx (dom, delegateEvents: true)

native: {"code":"import { template as $zeusTemplate, ... }", ...}   ← 编译成功
wasm:   {"code":"","diagnostics":[{"code":"ZEUS_INPUT_TOO_DEEP",
         "message":"Input nesting exceeds the supported limit of 506 levels."}]}
```

同一个文件，native 编译器编译成功，WASM 编译器判定嵌套超限。parity 测试要求两者
**逐字节一致**，因此失败。

## 2. 为什么最初误判成"设计取舍"

`crates/zeus_compiler/src/nesting.rs` 的模块文档确实写明两个目标各有预算：

> The native budget is 8,192 JSX levels' worth of weight … The WebAssembly
> budget is 506 JSX levels, because browser engines have much smaller call
> stacks.

读了这段就停下来，会把"预算是不同的"当成"分歧是合理的"。但两件事不同：
**预算不同是设计**，**一个深度 8 层的文件被判成超过 506 层是缺陷**。

实测的分歧区间（二分，纯 JSX 嵌套）：

| 构造                           | WASM 上限 | Native 上限 |
| ------------------------------ | --------- | ----------- |
| 真正的嵌套 `<div><div>…`       | 505 层    | 8191 层     |
| 兄弟节点 `{表达式}`（修复前）  | 217 个    | 12817 个    |
| 带属性值标签的子元素（修复前） | 154 个    | 不触发      |

`gallery.tsx`：695 行、5 个 `<section>`、**真实 JSX 嵌套深度 8 层**。

## 3. 根因与修复

预检是一个手写的词法扫描器，成本沿"表达式脊柱"累加：`push` 记下
`saved_cost`，`pop` 恢复；兄弟表达式通过 `start_sibling()` 回到父帧的
`entry_cost`，于是 `f(a, b, c)` 这类长参数列表不会累积。

JSX 路径上有三处没有遵守这个模型：

1. **`scan_jsx_children` 的 `{`**：子表达式直接 `push`，没有先
   `start_sibling()`，于是每个 `{expr}` 叠在上一个之上。
2. **`close_brace_in_code` 的 JSX 分支**：`pop()` 之后又 `charge(W_JSX_EXPR)`，
   把这笔成本永久留在父级脊柱上。
3. **`scan_jsx_tag` 的 `>`**：切到子节点模式时没有 `start_sibling()`，第一个
   子元素继承了最后一个属性留在脊柱上的成本。

第 3 条决定了触发的形状：`<section>` 无属性时正常（属性扫描不 charge），
`<section a="b">`、`<section a={1}>`、`<section a="">` 都会让后续每个子元素累积。
这解释了为什么我最初造的合成用例全部"健康"——它们用的是无属性标签。

还有一个独立的误判：`starts_type_parameters()` 把 `a="b"` 里引号**外**的 `=`
当成 `<T = Default>` 的默认类型参数，于是标签走了 `W_TYPE_ARGS` 分支而没有
自己的 `JsxElement` 帧。修法：`=` 之后紧跟引号即判定为 JSX 属性。

修复后 `gallery.tsx` 两个编译器输出完全一致（39583 字节）。

回归测试（`crates/zeus_compiler/src/nesting.rs`）：

- `attributes_do_not_leak_onto_children` — 断言峰值成本不随子元素个数增长
  （scale-free，因为两套权重表相差两个数量级，固定阈值只能测到一边）
- `sibling_expressions_do_not_accumulate` — 500 / 5000 个兄弟子表达式与属性
- `a_deep_jsx_expression_is_still_rejected` — 真正的深表达式仍然被拒

## 4. 为什么没有在 PR 上被发现

`#250` 的 PR CI 里 **`rust-compiler` 是 skipping**：

```
ci-gate        pass
rust-compiler  skipping
```

impact 分析没有把 `examples/**` 算进 Rust 测试的触发路径。但 parity 测试
（`packages/core/compiler-wasm/__tests__/parity.test.mjs`）会遍历 `examples/`、
`benchmarks/`、`scripts/playground/fixtures/` 下的**全部 `.tsx`**：

```js
const corpusRoots = ['examples', 'benchmarks', 'scripts/playground/fixtures']
```

这是一个真实的 gate 覆盖漏洞。已修：新增 `parity-corpus` area，映射到
`examples/**`、`benchmarks/**`、`scripts/playground/fixtures/**`，并加入
`JOB_NEEDS` 的 `rust-compiler`。

`scripts/ci/__tests__/impact-analysis.spec.ts` 里原来有一条断言
`planFor(['examples/admin/src/pages.tsx'])` **不**包含 `rust-compiler`——
它断言的正是这个缺陷，已改为断言包含，并覆盖另外两个语料根。

## 5. 与 P11 三个 PR 的关系

**无。** #247 只改 `compiler-native.yml` 与文档；#251 改 `playground-engine`；
#252 改 `check-admin.ts` 与文档。三者都不碰 `examples/admin/src/gallery.tsx`、
不碰 `crates/`、不碰 parity 测试。

gallery.tsx 由 `610e5f48`（#250）引入，该 PR 的 `rust-compiler` 是 skipping，
main 上的 CI 在合并时是 cancelled。这个红灯是 #250 的遗留，不是本轮合并造成的。

## 6. 教训

"两个预算不同"是一个真实的设计事实，但它**不能**用来解释任何一次具体分歧。
要判断一次分歧是设计还是缺陷，得测出被拒输入的**实际深度**——`gallery.tsx`
是 8 层，不是 506 层。
