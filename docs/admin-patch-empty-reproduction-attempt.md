# `PATCH {}` 复现尝试：结论与对既有诊断的修正

日期：2026-11-13
基线：`main` @ `7d1031e4`（含 `11a7bbfc` 的 `onInput` 写回修复）
对照：`docs/admin-patch-empty-request-investigation.md`（下称"原诊断"）

---

## 0. 结论先说

**在当前代码上，`PATCH {}` 无法复现。** 原诊断给出的五步确定性路径（打开编辑 → 输入 → Cancel → 重开 → Save）**不产生空 PATCH**：实测发出的请求体是 `{"email":"reopen.probe@example.test"}`，详情页也正确更新。

原诊断的机制结论——"`seedValue` 的 `dataset.seeded` 守卫在 `Show` 重挂时阻止重播种"——**与实现不符**，因此它提出的三种修法都建立在一个不成立的前提上。

真正被观测到的异常是另一个：**编辑器子树在每次按键时被重建约 4 次**。这才是值得追的东西，但它今天不产生空 PATCH。

## 1. 原诊断的机制为什么不成立

原诊断说元素被框架"复用"（同一个 DOM 节点，`dataset` 保留）。读 `ScopedSubtree.replace()`：

```
replace(render) {
  this.dispose()          // 移除旧节点
  ...
  nodes = insertTracked(parent, render(), this.marker)   // 全新节点
}
dispose() {
  this.scope.stop()
  removeNodes(this.nodes) // ← 旧节点离开 DOM
  this.nodes = []
}
```

`<Show>` 走 `mountDynamic` → `subtree.replace()`，每次求值都**丢弃旧节点、创建新节点**。`dataset` 属于旧节点，随它一起消失；新节点上的 `dataset.seeded` 是空的。

实测印证（`scripts/check/probe-admin-editor-reopen.ts`，Chromium 156，真实 Admin server）：

```
[1] after opening the editor
  email field: {"value":"ada@example.test","seeded":"true","marked":true}
[4] after reopening the editor      // Cancel → 再次点 Edit
  email field: {"value":"ada@example.test","seeded":"true","marked":false}
```

`marked` 是挂在 `WeakSet` 上的原始元素引用。重开后 `marked: false` —— **不是同一个元素**。既然是新元素，`seedValue` 的守卫就不可能挡住播种，因为守卫读的是新元素上不存在的属性。

进一步验证：**把守卫整个删掉，行为完全不变** —— 逐字符输入后的值、重建次数、最终 PATCH body 全部一致。

准确的说法是：在这条路径上守卫从未阻止过任何一次播种。它不是"永远无用的死代码"——如果将来 `<Show>` 改为复用节点，它会立刻生效并重新引入这个问题。但在当前实现下，它不保护任何东西，也无法作为修复点。

## 2. 真正观测到的异常：每次按键重建整个子树

同一个探针给 `#user-email` 计数（`MutationObserver` + `WeakSet`，节点对象首次出现即 +1）：

| 时刻         | 值                          | `seeded` | 元素对象被替换次数 |
| ------------ | --------------------------- | -------- | -----------------: |
| 打开编辑器   | `ada@example.test`          | `true`   |                  1 |
| 按一次 `r`   | `ada@example.testr`         | `true`   |              **5** |
| 按 `e`       | `ada@example.testre`        | `true`   |              **9** |
| 按 `o`       | `ada@example.testreo`       | `true`   |             **13** |
| `.fill()` 后 | `reopen.probe@example.test` | `true`   |             **17** |

每按一个键，节点被替换 4 次。`<Show when={editing()}>` 的 `editing` 在输入期间不变，所以重建来自 `Show` 内部——`prop:open={editing()}` 所在的 `zw-dialog` 子树。

**值没有丢**，因为每次重建时 `draft()` 已经包含最新字符（`onInput` 先写回）。这就是为什么今天保存正确：**是 `onInput` 写回在兜底，不是 `seedValue`。**

## 3. 为什么这仍然危险（CI 为什么会红）

保存路径是：

1. `onInput` → `patch('email', value)` → `setDraft`
2. 重建发生 → `seedValue(element, draft().email)`

如果某次重建落在 ①和②之间（`setDraft` 已排队但尚未提交，重建的 effect 先跑），新节点会拿到上一个字符的 draft。之后用户继续输入，`onInput` 会把值补回来——**除非重建恰好发生在最后一次输入之后、Save 之前**。那时 DOM 是新节点（值 = 旧 draft），而 `saveUser` 读的是 form DOM，于是 `changedFields` 判定"没变化"，发出 `{}`。

CI 的日志与此一致：`-> PATCH /api/users/ada {}`，且 `firefox`/`webkit` 同 run 通过——这是时序概率，不是引擎差异。

**但我没有复现它。** 8 倍 CPU 降速、真实 CI 导航路径（列表 → 行 → open-selected-user）、逐字符输入，全部失败：

```
[6] requests to /api/users/:
  -> GET /api/users/ada
  -> PATCH /api/users/ada {"email":"reopen.probe@example.test"}
```

所以第 3 节是**推断**（INFERRED），不是实测（MEASURED）。要把它变成实测，需要能在重建与 `setDraft` 之间插入一次强制调度——那是下一轮的事，不是这一轮能声称的。

## 4. 因此：不改框架语义

原诊断建议动 `Show`/`ref` 的语义。基于 §1，这个前提不成立：

- `Show` 没有复用节点，`ref` 也没有在旧节点上重跑；
- 每个节点都是新元素，守卫没有机会生效，删掉后行为不变；
- 改 `Show` 无法解决"重建次数过多"——那才是观测到的事实。

现在改框架语义，会是在没有缺陷证据的情况下去改最敏感的卸载/重挂逻辑。

## 5. 建议的下一步（按证据强度排序）

1. **查清每键 4 次重建的来源。** 这是唯一被实测到的异常。`zw-dialog` 在 `packages/web-c/` 之外（`@zeus-web/*`），先确认重建来自 WebC 内部还是 `prop:open` 的绑定。每键 4 次是性能问题，也是 §3 竞态窗口的来源。
2. **把 §3 变成可复现的测试。** 在 `setDraft` 与重建之间插入一次 `await Promise.resolve()` 或 `queueMicrotask`，让窗口稳定出现。没有这一步，任何修复都无法验证。
3. **不要**先改 `seedValue` 或 `Show`。前者在当前实现下不生效，后者的前提不成立。

## 6. 本轮的产出

`scripts/check/probe-admin-editor-reopen.ts` —— 只读探针，可复跑：

```
pnpm -F @zeus-js/example-admin build
pnpm exec tsx scripts/check/probe-admin-editor-reopen.ts
PROBE_CPU_THROTTLE=8 pnpm exec tsx scripts/check/probe-admin-editor-reopen.ts
```

它打印每一步 DOM 值、`dataset.seeded`、元素对象是否被替换、替换次数，以及所有 `/api/users/` 请求。它不写仓库文件，不是 CI 门禁。

## 7. 与原诊断的差异汇总

| 原诊断                         | 本文                                           |
| ------------------------------ | ---------------------------------------------- |
| 五步路径 100% 复现空 PATCH     | **不复现**；PATCH 带正确 body                  |
| 元素被框架复用，`dataset` 保留 | 元素每次被替换，`WeakSet` 证明对象不同         |
| `seedValue` 守卫阻止重播种     | 每个节点都是新的，守卫无从生效；删除后行为不变 |
| 修复需动 `Show`/`ref` 语义     | 前提不成立；应查每键 4 次重建                  |
| ——                             | 新发现：每次按键节点被替换 4 次（MEASURED）    |
