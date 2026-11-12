# Admin PATCH 空请求竞态：调查报告

日期：2026-11-13
基线：`origin/main` @ `7d1031e4`
状态：**根因已确认，修复未实施**（需要改动 `Show` / `ref` 的交互语义，超出本任务范围）

---

## 1. 现象

`scripts/check/check-admin.ts` 的 chromium 用例偶发失败：

```
PATCH /api/users/ada {}
Expected: "ada.updated@example.test"
Received: "ada@example.test"
```

页面显示 "Saved"，但邮箱仍是旧值。同一 task 的 Firefox / WebKit 通过。

## 2. 确定性复现

不需要等待 flake。用一条真实交互路径即可稳定触发：

1. 打开 `/admin/users/ada`；
2. 点 "Edit member"，在 `#user-email` 里输入新地址；
3. **点对话框的 Cancel 按钮**（真实用户路径，触发 `closeEditor()`）；
4. 重新点 "Edit member"；
5. 点 Save。

第 5 步的请求体是 `{}`，100% 复现。

验证过两条关闭路径，行为一致：

| 关闭方式                           | 对话框卸载    | 重开后 `#user-email` 的值    |
| ---------------------------------- | ------------- | ---------------------------- |
| 点 Cancel 按钮                     | 是（count 0） | `ada@example.test`（初始值） |
| 直接 dispatch `open-change(false)` | 是            | `ada@example.test`           |

Cancel 是真实的用户操作，因此这不是一个只能靠脚本构造的状态。

## 3. 根因

### 3.1 三个事实，逐条实测

用 `__zeusEvents` / `__zeusDirectEvents` / `dataset.seeded` / `value` 在浏览器里观测同一个
`#user-email` 元素：

| 时刻           | `dataset.seeded` | `value`                | `__zeusEvents` |
| -------------- | ---------------- | ---------------------- | -------------- |
| 首次打开对话框 | `"true"`         | `ada@example.test`     | `["input"]`    |
| 输入之后       | `"true"`         | `x@example.test`       | `["input"]`    |
| 关闭再打开     | `"true"`         | **`ada@example.test`** | `["input"]`    |

结论：

1. **输入本身是成功写入 DOM 的**（第二行）。所以问题不在 `fill()` 或事件时序。
2. **关闭再打开后，值是初始值**（第三行）。字段被重置了。
3. **`dataset.seeded` 仍是 `"true"`**。这说明 `seedValue` 的守卫在重开时**跳过了重播种** —— 它以为这个元素已经播种过。

### 3.2 机制

`examples/admin/src/pages/user.tsx`：

```tsx
<Show when={editing()}>
  <zw-dialog ...>
      <input
        id="user-email"
        ref={(element) => { seedValue(element, draft().email ?? '') }}
        onInput={(event) => patch('email', event.currentTarget.value)}
      />
```

- `<Show>` 在 `editing()` 变 false 时卸载子树；
- `bindDialog` 把对话框的 `open-change(open:false)` 映射为 `setEditing(false)`，
  所以**用户关闭对话框就卸载了字段**；
- 重开时 `<Show>` 重新挂载，`ref` 再次被调用；
- `seedValue` 看到 `element.dataset.seeded === 'true'` 就直接返回。

`seedValue` 的守卫（`examples/admin/src/pages/shared.tsx`）：

```ts
function seedValue(element, value) {
  if (!element) return
  if (element.dataset.seeded === 'true') return // ← 挡住重播种
  element.value = value
  element.dataset.seeded = 'true'
}
```

守卫是为"元素复用时不覆盖用户正在输入的内容"设计的。但在这条路径上，
元素**被 Zeus 复用**（同一个 DOM 节点，`dataset` 保留），而值已被框架重置为
`draft()` 的旧内容。守卫因此从"保护用户输入"变成了"阻止正确播种"。

### 3.3 空 patch 的最后一步

`saveUser` 从 form DOM 读值：

```ts
const patch = { email: value('#user-email'), ... }
await mutation.mutateAsync({ id, patch: changedFields(current, patch) })
```

重开后 DOM 值是 `ada@example.test`，与 `current.email` 相同，`changedFields` 返回 `{}`，
于是发出 `PATCH {}`。**服务端行为正确**（空 patch = 无改动），页面如实显示 "Saved"。
缺陷完全在客户端。

## 4. 这是代码缺陷还是测试时序问题

**是代码缺陷。** 依据：

1. 复现不依赖时序 —— 用确定性的"关闭再打开"就能触发，与 `fill()` 的调度无关。
2. 触发的是一条**真实用户路径**：打开编辑、输入、关闭、再打开。用户会这样做。
3. CI 上的偶发失败与它同源：当一次后台 query 刷新或 `Show` 重建恰好落在
   `fill()` 与点击 Save 之间时，同样的状态就会出现。这解释了为什么只在
   chromium 上偶发 —— 不是 chromium 特殊，而是那次运行的时序碰巧。

因此**不能**用延长 sleep 或重试来"修复"：那只是降低复现概率，缺陷仍在。

## 5. 为什么没有在本轮实施修复

修复要动的不是这一处 `seedValue` 调用，而是三者的交互语义：

- `Show` 卸载/重挂载时，框架是否应把"复用的 DOM 节点"视为新节点；
- `ref` 回调在元素被复用时是否应该再次执行（现在执行了，但 `dataset` 让它无效）；
- `seedValue` 的幂等守卫应该以什么为键 —— `dataset` 在跨挂载时不可靠。

三个选项都有代价：

| 方案                                        | 代价                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `seedValue` 改为每次 `ref` 都播种           | 会在用户输入过程中因重渲染覆盖正在输入的内容 —— 这正是守卫要防的         |
| `Show` 重建时清空 `dataset.seeded`          | 需要 `Show` 知道子树的 `dataset` 语义，属于框架层侵入                    |
| 表单改为受控（`prop:value` + draft 单向流） | 与既有注释明确记录的"受控绑定会把旧值写回输入框"冲突，需要先解决那个问题 |

这是框架语义层面的改动，应与 `Show` / `ref` 的既有设计一起论证，
不能塞进一个 Admin 页面修复里。

## 6. 建议的下一步

1. **先加一个确定性回归测试**（本报告第 2 节的五步），让这个缺陷在 CI 里稳定可见，
   而不是继续以 flake 的形式出现。这个测试**现在就可以加**，且不修改任何生产代码。
2. 就 `Show` 重建与 `ref` 重入的语义单独立项：明确"元素复用"与"元素新建"的判定，
   以及幂等初始化应该以什么为键。
3. 在 2 有结论前，**不要**改动 `seedValue` 的守卫 —— 它现在同时在防一个真实的
   覆盖问题（见 `pages/user.tsx` 里关于受控绑定的注释）。

## 7. CI 上的触发路径与本地不同

写这份报告时以为"关闭再打开"就是 CI 上的路径。后续证据否定了这一点。

### 7.1 本地跑 CI 的同一脚本，5/5 通过

```
run 1..5: 0 empty-patches, 1 passes
```

### 7.2 CI 上连续 2 次失败，且日志里没有中间请求

Run 43272772347 的 `check:admin` 失败片段里，用户请求只有：

```
-> GET /api/users/ada
<- 200 GET /api/users/ada
-> PATCH /api/users/ada {}
<- 200 PATCH /api/users/ada
```

**从 GET 到 PATCH 之间没有任何别的请求。** 这排除了"后台 query 刷新"作为触发器 ——
若发生刷新，日志里会多一条 GET。

### 7.3 因此，CI 的触发器仍在 `Show` 重挂载之内，但来源不是关闭/刷新

两者都指向同一个底层事实（`seedValue` 的 `dataset` 守卫在元素复用时阻止重播种），
但**进入那个状态的路径在本地无法稳定重现**。已排除：

| 候选                                 | 实测                                     |
| ------------------------------------ | ---------------------------------------- |
| 关闭再打开（Cancel / `open-change`） | 本地 100% 复现，但 CI 的断言路径不经过它 |
| `staleTime` 到期后的 query 刷新      | 本地正常，`PATCH` 带正确 body            |
| 8× CPU 限速模拟慢 runner             | 本地正常                                 |

**未排除**：runner 上首次渲染与 `fill()` 的竞态窗口更宽，导致 `ref` 在 `fill()`
之后才跑完；或 `zw-dialog` 在慢环境下的一次额外 `open-change`。

### 7.4 这对修复意味着什么

根因（`dataset.seeded` 守卫与元素复用冲突）没有变，调查报告的 §3 仍然成立。
但**不能声称"复现已完全对应 CI"** —— 本地复现的是同一个缺陷的另一条入口。
修复应当以"重挂载后字段值必须等于 `draft()`"这一不变量为目标，
而不是针对某一条触发路径打补丁。

## 8. 未确定事项

- 后台 query 刷新导致 `Show` 重建的具体触发频率 —— **未测量**。
  本报告只确认了"关闭再打开"这条确定性路径。
- Firefox / WebKit 上是否同样可复现 —— 本机未安装，**NOT_RUN**。
  按机制推断三引擎应当一致，因为缺陷在框架层而非浏览器层，但未实测。
- 后台 query 刷新（而非用户关闭）触发 `Show` 重建时的行为 —— **未单独验证**。
  两者都走 `setEditing(false)`，但刷新路径不经过 `bindDialog`。
