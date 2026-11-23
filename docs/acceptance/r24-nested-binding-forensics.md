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

## 5. 根因（已确认，R24.1）

原文把结论写成「运行时没有复现缺陷」。**那个结论是错的**，原因见下。

### 5.1 根因：`window.__signals` 被后导入的模块覆盖

fixture 的顶层语句是：

```js
const signals = (window.__signals = (() => { ... })())
```

它被**编译了两次** —— 一次 SSR、一次 DOM —— 两份都会执行这条赋值。
于是**后导入的模块赢**。

实测（`temp/probe/signal-identity.ts`，chromium）：

| 导入顺序 | `window.__signals` 指向 |
| -------- | ----------------------- |
| DOM 先   | **SSR 的 signal**       |
| SSR 先   | **DOM 的 signal**       |

原 harness 是 DOM 先导入，所以 `window.__signals` 是 **SSR 的副本**，
而 hydration 的树绑定的是 DOM 的副本。每次 `setLabel` 都写到一个
没人渲染的 signal 上。

### 5.2 反事实：失败随导入顺序翻转

同一份 HTML、同一套运行时，只交换两行 import：

| 导入顺序 | `#child-label` 更新       | Show 关闭           |
| -------- | ------------------------- | ------------------- |
| DOM 先   | `child label`（**失败**） | `false`（**失败**） |
| SSR 先   | `UPDATED`（成功）         | `true`（成功）      |

**失败随顺序翻转**，这是因果关系的判据。

### 5.3 为什么之前七种对照都通过

因为它们用的 fixture 写的是 `window.__state` / `window.__probeSignals`，
或者只导入一份模块 —— 没有两份模块争同一全局名。对照组避开了缺陷本身。

**这是我在 R24 里判断错的地方**：我把"对照组通过"当成了"运行时正确"的证据，
而没有先确认对照组和失败组是否真的在测同一件事。

---

## 6. 修复（R24.1 TASK 03–05）

### 6.1 fixture 改为导出具名对象

```js
export const signals = (() => { ... })()
```

不再写 `window`。每个模块持有自己的 signal。

### 6.2 harness 显式导入 DOM 模块的控制器

```js
import { App, signals } from '/modules/dom.js'
import { App as SsrApp, signals as ssrSignals } from '/modules/ssr.js'

export const controls = signals
export const ssrControls = ssrSignals
```

检查里的所有写入改为 `window.__harness.controls.*`。

### 6.3 诊断码

`assertControlsBound()` 在任何检查开始前调用。若 `controls === ssrControls`，
抛 `CONTROL_SIGNAL_NOT_BOUND_TO_DOM`，把失败从"三分钟后的超时"变成"第一行的命名错误"。

仅用于测试诊断，**没有新增公共运行时 API**。

### 6.4 一个断言错误

`closing a grandchild branch` 原本断言「存活 scope 数下降」。实测：

```
before: 3 created / 0 disposed   (净 3)
after : 4 created / 1 disposed   (净 3)
```

关闭分支确实释放了一个 scope，但重建兄弟内容时又开了一个，**净数不变**。
断言改为 `scopesDisposed` 增长 —— 那才是"释放了"的直接证据。原断言会
被补偿性创建抵消，**既能误报泄漏，也能掩盖真泄漏**。

---

## 7. 最终状态

| 检查                             | 结果                                       |
| -------------------------------- | ------------------------------------------ |
| `check:nested-hydration-browser` | **7/7 通过**（chromium）                   |
| `check:nested-binding-browser`   | **4/4 通过**                               |
| 导入顺序 DOM 先                  | 通过                                       |
| 导入顺序 SSR 先                  | 通过                                       |
| 反事实（controls = ssrSignals）  | 失败，报 `CONTROL_SIGNAL_NOT_BOUND_TO_DOM` |

两个检查已接入 `browser-runtime` job，三引擎运行。

---

## 8. 历史记录（已被推翻，保留过程）

R24 早期版本的结论是「运行时在七种驱动方式下全部通过，因此不是产品缺陷」。
那个推理的漏洞是：七种对照都没有复现「两份模块争同一全局名」这个条件。
保留在这里是因为它说明了**对照组必须与失败组测同一件事**，否则"通过"没有意义。
