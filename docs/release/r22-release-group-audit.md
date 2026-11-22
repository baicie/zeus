# R22 TASK 41 / 50：`0.2.0-rc.3` 的发布组状态

**只读 registry 查询。未执行任何发布、dist-tag 或 tag 操作。**

测量时间：2026-11-22
registry：`https://registry.npmjs.org`
脚本：`pnpm release:audit-group --version 0.2.0-rc.3`
原始数据：`temp/release/group-audit-0.2.0-rc.3.json`

---

## 1. 结论先行

| 问题                 | 答案     |
| -------------------- | -------- |
| 发布组共几个包       | 32       |
| 有 `0.2.0-rc.3` 的   | **7**    |
| 没有的               | **25**   |
| 是否部分发布         | **是**   |
| 应用能否用 rc.3 构建 | **不能** |

**rc.3 的框架本体没有发布。** `@zeus-js/zeus`、`@zeus-js/runtime-dom`、
`@zeus-js/signal`、`@zeus-js/router`、`@zeus-js/i18n` —— 全部没有 `0.2.0-rc.3`。

发布在第 8 个包 `@zeus-js/compiler-native-linux-x64-gnu` 中断（R21 TASK 34
已确认位置），而已发出的是按 kind + name 排序后的前 7 个：

```
@zeus-js/compiler                            ✓
@zeus-js/compiler-native                     ✓
@zeus-js/compiler-native-darwin-arm64        ✓
@zeus-js/compiler-native-darwin-x64          ✓
@zeus-js/compiler-native-linux-arm64-gnu     ✓
@zeus-js/eslint-plugin                       ✓
@zeus-js/playground-engine                   ✓
```

它们**恰好都不是应用运行时**。所以「7/32 已发布」这个说法会让人以为还剩一部分
可用——实际是一个都用不了。这一条要写清楚，因为它决定了恢复的优先级。

---

## 2. `latest` 绑定：两个包被污染

既有工具 `pnpm repair:latest-tags --check`（政策：`latest` 只能指向稳定版，
没有稳定版就应当缺省）报告 **15 个包的 `latest` 指向预发布版**，其中两个是这次
rc.3 发布造成的：

| 包                           | `latest`     | 原因                        |
| ---------------------------- | ------------ | --------------------------- |
| `@zeus-js/eslint-plugin`     | `0.2.0-rc.3` | rc.3 是它的**首次正式发布** |
| `@zeus-js/playground-engine` | `0.2.0-rc.3` | 同上                        |

这两个包的历史版本只有 `0.0.0-stage`（占位）与 `0.2.0-rc.3`。npm 的规则是
**首次发布无论 `--tag` 写什么都会绑定 `latest`**，所以 `--tag rc` 没能保护它们。

其余 5 个已发布包的 `latest` 没有被污染（它们有更早的正式版本），rc.3 只挂在
`rc` 标签上。这说明机制本身是对的，缺口只在「首次发布」这一种情况。

### 2.1 这与 TASK 50 的关系

TASK 50 要求「`latest` 不得指向预发布版」。当前的答案是：**政策已写、工具已有、
但未被执行**——`repair:latest-tags --check` 现在就会失败，退出码 1。

执行 `--apply` 需要 npm 写权限，属于本轮的禁止项（真实 dist-tag 修改）。
因此本轮只记录状态，不动 registry。

---

## 3. 对恢复顺序的影响

原来的恢复计划是「重跑 rc.3，`skipExisting` 跳过已发布的 7 个包」。

审计后的补充：

1. **不能只补 native 平台包。** 缺的不止那 4 个平台包，还有整个运行时。
   只补 native 会让 native 看起来齐了而应用仍然建不起来。
2. **恢复的验收标准不是「32 个都在」。** 是「一个新项目能装、能编译、能跑」。
   这两个在 rc.3 上不是同一件事——见
   [`r22-native-install-boundary.md`](./r22-native-install-boundary.md)。
3. **两个被污染 `latest` 的包需要单独修复**，且修复是 dist-tag 操作，
   需要授权。

---

## 4. 新增脚本

`scripts/release/audit-release-group.ts`（`pnpm release:audit-group`）：

- 从 `release.config.ts` 读发布组，不复制名单；
- 逐包问「这个版本有没有」；
- 再问「哪些 dist-tag 指向它，`latest` 是否也在其中」；
- 部分发布时退出码 1，因为那是唯一需要决策的状态。

串行查询是刻意的：并发 `npm view` 会触发限流，而限流错误会被读成「未发布」。

### 4.1 脚本第一版的 bug（已修）

第一版用 `npm dist-tags --json <name>` 读标签，那个形式**忽略 `--json`
输出纯文本**（`beta: 0.1.1-beta.20`），`JSON.parse` 抛错，被一个空的 `catch {}`
吞掉——于是每个包都显示「没有任何标签」。而 `latest` 污染恰恰就是从这个字段读
出来的，等于把要查的东西查没了。

修正：改用 `npm view <name> dist-tags --json`，并且把失败写进 `tagsError`
字段而不是留空——空字段和「确实没有标签」读起来是一样的。

---

## 5. 本轮未做

| 项                           | 原因                       |
| ---------------------------- | -------------------------- |
| `repair:latest-tags --apply` | 真实 dist-tag 修改，禁止项 |
| 重跑发布                     | 真实 publish，禁止项       |
| provenance attestation       | 未查询（见 TASK 42 §3）    |
| 隔离 registry 演练           | 见 TASK 45 状态            |
