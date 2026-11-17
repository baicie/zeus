# ai-workbench P0 gate：firefox 上的草稿丢失

记录时间：2026-11-17
状态：**真实缺陷，已定位到失败点，根因未找到**

## 0. 修正一次错误判断

本轮早些时候，这份记录的前一版把这个失败判为 flaky，理由是「所有断言 `ok: true`，
失败只在 Playwright 层」。**那个判断是错的。**

重新下载日志后看到的是：

```json
{
  "browser": "firefox",
  "surface": "interactive",
  "status": "failed",
  "checks": [],
  "error": "Error: round trip 9: My model keeps one composer and its draft:
            [{\"kind\":\"byok\",\"value\":\"\",\"focused\":false}]"
}
```

`checks` 是**空数组**，不是「全部 ok」。前一次解析把 chromium 的 checks 误当成了
firefox 的——group 边界没对齐，而两个引擎的 JSON 结构完全相同，错位后看起来像
「断言全绿」。

空数组的原因在 `scripts/checks/ai/check-ai-workbench-p0.ts:68`：`record()` 在
`ok === false` 时**抛异常**，所以该引擎的任何一条断言失败都会让 `checks` 停在此前的
长度。这次是第一条就失败，所以为空。

**教训**：用 `grep | paste` 从结构化日志里抽字段，必须同时抽取能标识分组的键
（`browser`），不能只抽 `status` 后按行配对。行数对得上不代表对齐。

## 1. 失败点

`scripts/checks/ai/check-ai-workbench-p0.ts` 的 round-trip 循环：

```ts
for (let index = 0; index < 20; index += 1) {
  await selectMode(page, 'host')
  /* ...断言 Host 只有一个 composer... */
  await selectMode(page, 'byok')
  const onByok = await waitForComposer(
    page,
    state =>
      state.length === 1 &&
      state[0]?.kind === 'byok' &&
      state[0]?.value === 'byok draft',
  )
  if (onByok[0].value !== 'byok draft') {
    record(
      checks,
      `round trip ${index + 1}: My model keeps one composer and its draft`,
      false,
      JSON.stringify(onByok),
    )
  }
}
```

失败在 `index === 8`（第 9 次）。观察到的状态：

```json
[{ "kind": "byok", "value": "", "focused": false }]
```

`length === 1`、`kind === 'byok'` 都对，**`value` 是空的**。

## 2. 已排除的原因

| 假设                     | 排除依据                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| 等待时间不够             | `waitForComposer` 有 5 秒超时，返回最后状态而非失败；真的等不到          |
| 测试点错了元素           | `length === 1` 且 `kind === 'byok'`，找到的就是那个 composer             |
| BYOK 视图被重建          | `byokView` 是单例（`main.ts:1840` `if (byokView) return byokView`）      |
| Zeus `<Show>` 重建丢输入 | 该视图是纯 DOM（`document.createElement('textarea')`），不使用 Zeus 组件 |
| 切换逻辑清空输入         | `selectMode` 只点选模式；`syncConversation()` 不碰 `input.value`         |

## 3. 剩下的可能

`input.value = ''` 在 `chat-view.ts` 只有两处：

| 行  | 触发条件            | 测试中是否该发生   |
| --- | ------------------- | ------------------ |
| 366 | `newConversation()` | 否——测试只切模式   |
| 450 | 提交发送后          | 否——测试没按 Enter |

两处都需要用户动作。但它们可能被**间接**触发：

- `chat-view.ts:618`：`conversationStore.load().then(...)` 里若无 active conversation 就调 `newConversation()`。这是一次性异步，测试已等过首屏，但慢机器上可能更晚兑现。
- `chat-view.ts:606` 的 store 订阅：`activeIdValue() !== conversation?.id` 时调 `syncConversation()`。`syncConversation` 本身不清空 input，但如果它导致 `conversation` 变成 `undefined`，后续某条路径可能触发 `newConversation()`。

`focused: false` 是补充线索：BYOK composer 在切换后本应保持焦点，而它没有。这与「按一个全新 conversation 重建了 composer」一致。

## 4. 为什么只在 firefox 上出现

三个引擎跑同一段测试，chromium 和 webkit 通过。可能是：

- firefox 的 `fill()` 与 autofocus 时序不同，让某个异步回调恰好落在切换之间
- 与引擎无关，只是 firefox 那一轮赶上了慢时序（CI 上三个引擎的顺序是固定的，所以「赶上」总是发生在同一个位置）

第二种可能性存在，意味着这是一个**跨引擎的时序缺陷**，只是被固定的执行顺序掩盖。
在没有复现之前不能下定论。

## 5. 复现困难

- 本地跑不出来（与我此前记录的 `zeus-ref-seeded-inputs-lose-text` 同一类：只在 CI 时序下触发）
- 前一次失败后 `gh run rerun --failed` 通过——**这不是修复的证据**，只是这次没触发

## 6. 建议的下一步

1. 在 `chat-view.ts` 的 `input.value = ''` 两处临时加日志，记录调用栈与当时的
   `conversationStore.activeIdValue()`，跑 CI 看哪条路径被触发。
2. 给这个 gate 加 Playwright trace（`--trace retain-on-failure`），失败时能直接看到
   DOM 事件序列。当前 artifact 里没有 trace。
3. 如果确认是 store 异步回调导致的 conversation 重建，修复方向是让「切换模式」不影响
   conversation 身份——而不是在 composer 上加保护。

## 7. 对发布的影响

这个 job **不在** `baicie/zeus-ui` 的必需检查列表里：

```
build, test / data-grid-benchmark, test / unit-test, test / unit-test-windows,
test / build-output, test / lint-and-test-dts, showcase / metadata,
showcase / unit, showcase / build, showcase / e2e, docs
```

所以它不阻塞 PR 合并，也不阻塞 `release.yml`（后者只要求 `ci.yml` 与
`compiler-native.yml` 的 evidence）。

但它是一个**真实的功能缺陷**：用户在慢机器上切换 Agent ↔ My model 时，BYOK 草稿可能
丢失。这不因为门禁不阻塞就变成不重要。
