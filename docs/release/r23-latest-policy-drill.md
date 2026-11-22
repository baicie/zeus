# R23 TASK 19 / 20：`latest` 的五种情形与修复计划

**完全隔离。未对真实 registry 写入。**
命令：`pnpm drill:latest-policy`
证据：`temp/release/latest-policy-drill.json`

---

## 1. 五种情形，实测

| 场景           | 前提               | 动作                        | 结果                   |
| -------------- | ------------------ | --------------------------- | ---------------------- |
| `rc-first`     | 无任何历史         | 发 RC，`--tag rc`           | `latest: 0.2.0-rc.9` ✗ |
| `stable-first` | 已有 `0.1.0`       | 发 RC，`--tag rc`           | `latest: 0.1.0` ✓      |
| `canary-first` | 无任何历史         | 发 canary，`--tag canary`   | `latest: canary` ✗     |
| `retry`        | RC 已发            | 重发同一个                  | `E409`                 |
| `repair`       | RC 已污染 `latest` | `dist-tag rm latest` + 读回 | **`latest` 仍在**      |

### 1.1 结论一：这不是 RC 的特例

`canary-first` 证明**任何首次发布**都会夺走 `latest`，与预发布标识无关。规则是
「首发必然绑定 `latest`」，`--tag` 只影响额外标签。

### 1.2 结论二：冲突码依 registry 而异

同一个重复发布：

| registry    | 错误码             |
| ----------- | ------------------ |
| npm         | `EPUBLISHCONFLICT` |
| Verdaccio 6 | `E409`             |

**所以发布工具不能对错误码分支。** `@baicie/release` 走的是
`npmVersionExists`（先查版本是否存在），这正是让重跑可移植的原因。
`run-recovery-drill.ts` 的注释里写「重复发布返回 `EPUBLISHCONFLICT`」——
那是 npm registry 的答案，本演练在隔离 registry 上得到的是 `E409`。两者都对，
但**只有前者被写下来过**。

### 1.3 结论三：`dist-tag rm` 退出 0 不等于标签被删

`npm dist-tag rm` 在 Verdaccio 6 上：

- 命令退出码 **0**；
- 打印 `-latest: @zeus-js/pol-rc-first@0.2.0-rc.9`；
- **读回仍然是 `latest: 0.2.0-rc.9`**。

`scripts/release/repair-latest-tags.ts` 第 182 行已经记录过这个现象（对照的是同一个
Verdaccio 6）。本演练独立复现了它。

**这条的意义**：修复工具必须在命令后用**读回**验证，不能信任退出码。仓库里的
工具做对了（`changeVerified` + `readLatest`），但这是一个容易被"简化"掉的细节。

---

## 2. TASK 20：真实 registry 的修复计划

只生成计划，**不执行 `--apply`**。

### 2.1 异常包清单

`pnpm repair:latest-tags --check`（2026-11-22）报告 **15 个包的 `latest` 指向
预发布版**。其中由 rc.3 这次发布造成的是两个：

| 包                           | 当前 `latest` | 有稳定版？                    | 目标 `latest` | 消费者影响                                |
| ---------------------------- | ------------- | ----------------------------- | ------------- | ----------------------------------------- |
| `@zeus-js/eslint-plugin`     | `0.2.0-rc.3`  | 否（只有 `0.0.0-stage` 占位） | **缺省**      | 无稳定版可用，`npm i` 会失败而不是装到 RC |
| `@zeus-js/playground-engine` | `0.2.0-rc.3`  | 否（同上）                    | **缺省**      | 同上                                      |

### 2.2 为什么目标是「缺省」而不是「指回旧版本」

这两个包的历史只有 `0.0.0-stage`（占位版本，不是可用发布）与 `0.2.0-rc.3`。
把 `latest` 指回 `0.0.0-stage` 会让 `npm i` 装到一个占位包——比装到 RC 更糟。

政策（`repair-latest-tags.ts` 文件头）写的是「没有稳定版时 `latest` 必须缺省」，
这正是这种情况。

### 2.3 回滚与审计

| 项         | 内容                                                      |
| ---------- | --------------------------------------------------------- |
| 变更前状态 | `latest → 0.2.0-rc.3`（两个包）                           |
| 变更动作   | 删除 `latest` 标签                                        |
| 回滚       | 重新 `dist-tag add <pkg>@0.2.0-rc.3 latest`               |
| 审计记录   | `repair-latest-tags` 写的报告文件；每次运行都记录读回结果 |
| 需要授权   | 是——真实 dist-tag 写入                                    |

### 2.4 剩余 13 个包

其余 13 个不在本轮的因果范围内：它们的 `latest` 早就指向 canary（
`0.1.1-canary.20260812...` 等），是更早的发布造成的。同一个 `--apply` 会一并
处理，但那需要一个独立的决策，不应当夹在 rc.3 恢复里做。

---

## 3. 与恢复计划的关系

rc.3 的恢复是**两件独立的事**：

1. **重跑发布**——补齐 25 个未发布的包（TASK 17/18 的演练覆盖这条路径）；
2. **修复标签**——两个包的 `latest` 污染（本文档 §2）。

重跑**不会**修复第 2 件：`skipExisting` 跳过已发布的版本，标签保持原样。
这条在 `run-recovery-drill.ts` 与本文档里各写了一次，因为它是最容易混淆的地方。

---

## 4. 未做

| 项                                     | 原因                                 |
| -------------------------------------- | ------------------------------------ |
| `repair:latest-tags --apply`           | 真实 dist-tag 写入，禁止项           |
| 剩余 13 个包的修复决策                 | 独立的发布决策，不属于本轮           |
| Verdaccio 上验证「删除后能否重新发布」 | 需要另一次发布，与本演练的结论无冲突 |
