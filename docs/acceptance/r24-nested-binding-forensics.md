# R24 TASK 01–11：嵌套组件 hydration 绑定的取证记录

测量时间：2026-11-22 / 23
基线：`9d0da888` 之后（R23 分支）
命令：`pnpm check:nested-binding-browser`、`pnpm check:nested-hydration-browser`

---

## 1. 现象与已经排除的解释

`check-nested-hydration-browser` 从 R22 起就在 chromium 与 webkit 上失败：

```
FAIL every adopted node keeps its identity across the hydration
FAIL a child signal updates the child node and leaves the parent alone
FAIL closing a grandchild branch disposes only that branch
```

结构化证据（R24 TASK 02，不是 `textContent` 字符串比较）：

```
pre : #text "child label" + <!--zeus:hydrate:/c5.r10-->   textContent "child label"
post: #text "child label" + <!--zeus:hydrate:/c5.r10-->   textContent "child label"
signal write: child label -> updated                       值确实变了
```

**结构完全正常**：没有 `branch` 混入文本节点，`grandchild` 的父节点是 `child`。
唯一的异常是 **binding 没有把新值写进那个文本节点**。

### 1.1 被实验排除的解释（每一条都伴随一次回滚）

| 假设                       | 实验                                                            | 结果                               |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| adopt 体缺 reactive owner  | 给 `adopt()` 与 `mount()` 各加 `runWithOwner(createOwner(), …)` | jsdom 下不加也通过，改动**已回滚** |
| 运行时核心必然错误         | jsdom 直接跑真实 fixture                                        | `child label` → `updated`，正常    |
| 嵌套组件本身无法工作       | 最小检查 `check:nested-binding-browser`                         | 4/4 通过                           |
| diagnostics session 干扰   | 加/去 `createRuntimeDiagnosticsSession().run`                   | 两种都正常                         |
| 二次 hydrate 污染          | 连续 4 轮 hydrate/dispose                                       | 全部通过                           |
| 模块内联 vs 独立文件       | 把内联脚本改成 `/entry.js`                                      | 两种都通过                         |
| 重复 hydrate（不 dispose） | 运行时正确抛 `ZEUS_HYDRATION_DUPLICATE_OWNER`                   | **拒绝是对的**                     |

---

## 2. 已确认的缺陷：`mountTrackingIdentity` 不释放 hydration owner

`scripts/check/fixtures/nested-hydration-harness.js` 的
`mountTrackingIdentity` 直接给容器赋 `innerHTML`，**没有先 dispose 上一棵树**：

```js
export function mountTrackingIdentity(html) {
  const container = document.getElementById('server')
  container.innerHTML = html        // ← 上一棵树的 hydration owner 仍然活着
  ...
  const outcome = hydratePlaced(container)
```

`beginHydrationSession` 正确地拒绝了第二次 hydrate：

```
ZEUS_HYDRATION_DUPLICATE_OWNER: the container already has a live hydration owner
```

于是：

1. 容器里留下的是**上一棵树**的节点；
2. 引用映射在 `innerHTML` 之后建立，所以每个 id 都"看起来被替换"；
3. **此后所有检查都在一棵被拒绝替换的树上运行**。

这条已修复（在赋 `innerHTML` 前 dispose）。修复后 `identity` 项不再带
`DUPLICATE_OWNER`，`replaced=["grandchild"]` 也与「Show 内组件重建」的设计一致。

---

## 3. 仍未定位的部分

修复 §2 之后，`a child signal updates the child node` 与
`closing a grandchild branch disposes only that branch` **仍然超时**。

**而同一份 fixture、同一个编译参数、同一套运行时，在
`check:nested-binding-browser` 里 4/4 通过。** 两者的差别只剩 harness 的文件
结构与调用顺序，而逐项对照（session、模块形式、hydrate 轮数、dispose 时机）
都已排除。

### 3.1 一个可疑但未证实的差异

harness 的 `App` 来自 `/modules/dom.js`，`window.__signals` 也由该模块在
**顶层**创建并赋值。`check-nested-binding-browser` 用的是同样的结构。

在 harness 页面上单独跑一次 `mount`（不经过检查流程）时：

```
S mount: {"ok":true,"error":null}
S write: "updatedS"
S read : {"text":"child label","signal":"updatedS"}     ← 失败
```

而同样的操作在 `check-nested-binding-browser` 的页面里成功。**这是目前唯一
可复现的、不依赖任何检查顺序的失败点**，也是下一步应当继续收缩的地方。

### 3.2 本轮没有做的事

- 没有修改 `autoHydration.ts` 的 adopt / mount 路径（两次尝试都无证据、已回滚）。
- 没有改 `emit.rs` 或 SSR emitter：两端 marker ID 对账一致
  （SSR 多出的 8 个 ID 全是静态元素标记，DOM 端不发射，符合设计）。
- 没有把 `replaced=["grandchild"]` 当成缺陷：Show 分支内禁止采纳是
  `withHydrationCreateFrame` 的文档化行为。

---

## 4. 交付物

| 文件                                                 | 作用                                                    |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `scripts/check/check-nested-binding-browser.ts`      | 最小复现：三次断言（采纳、嵌套绑定更新、Show 分支开关） |
| `scripts/check/fixtures/nested-hydration-harness.js` | 修复 `mountTrackingIdentity` 的 owner 泄漏              |

`check:nested-binding-browser` 目前**通过**，因此它不是红测试，而是一份
「同一 fixture 在另一种驱动方式下正确」的对照证据——它把缺陷范围从
"hydration 坏了"缩小到 "harness 驱动方式下的 hydration 坏了"。

---

## 5. 追加的对照实验（全部通过）

把 harness 的机制逐项移植到最小检查里，每一项单独替换后仍然 4/4 通过：

| 移植的变量                                              | 结果                                      |
| ------------------------------------------------------- | ----------------------------------------- |
| harness 的 `hydratePlaced` 逐字复制（含 `session.run`） | 通过                                      |
| 全局名改成 `__probeSignals`（排除与 `__signals` 冲突）  | 通过                                      |
| 入口脚本从内联改成 `/entry.js` 独立文件                 | 通过                                      |
| 四轮 hydrate/dispose                                    | 通过                                      |
| 重复 hydrate（不 dispose）                              | 被 `DUPLICATE_OWNER` 正确拒绝，之后仍通过 |

**七种驱动方式全部通过，运行时本身没有复现出缺陷。**

---

## 6. 结论与残留

### 6.1 已修复的两个真实缺陷

1. **`mountTrackingIdentity` 不释放 hydration owner**（§2）—— 已修，`identity`
   项随后通过。
2. **`identity` 断言与设计冲突** —— 它要求 `replaced` 为空，但 Show 分支内
   禁止采纳是 `withHydrationCreateFrame` 的文档化行为。已改为只对动态区域
   之外的节点断言。

### 6.2 未定位

`a child signal updates the child node` 与 `closing a grandchild branch`
在 `check-nested-hydration-browser` 里仍超时，而同一 fixture 的七种其它驱动
方式全部通过。

**本轮没有把它写成产品缺陷**，因为证据不支持：如果运行时真有缺陷，最小复现
应当同样失败。

### 6.3 下一步

1. 在 `check-nested-hydration-browser` 的**页面内**加 `bindEffect` 调用计数
   （测试专用 instrumentation），确认 binding 是否被创建；
2. 若未创建，说明 adopt 体在该路径下没执行到 `mountDynamic`；
3. 若已创建，记录它绑定的 Text 节点引用，与文档里的节点比对。

这两步能把范围再缩小一格，但仍不应在拿到证据前改运行时。
