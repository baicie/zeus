# RFC: main 与 Release Canary 的 Native Matrix 去重

状态：**提案。当前未启用去重。**
日期：2026-11-13
基线：`origin/main` @ `7d1031e4`

---

## 0. 为什么这份 RFC 先于实现

一个更早的实现曾做过跨工作流去重：main push 时如果 `release-canary.yml`
在同一 SHA 上存在任意 run，就跳过 `Compiler Native Matrix` 的独立七平台构建。

这个判断不成立。一个 run 的**存在**不等于**该 run 的七个平台构建与 artifact 都成功**。

本文件记录它为什么不成立、以及什么样的实现才够。
**在此之前，`main` 保留自己的独立 matrix。**

---

## 1. 重复是真的，而且已经量过

| Run         | 触发      | 内容                                                                   | Runner 分钟 |
| ----------- | --------- | ---------------------------------------------------------------------- | ----------- |
| 43221565275 | main push | `Compiler Native Matrix` 独立七平台                                    | 14.7        |
| 43221565365 | main push | `Release Canary` → `native-prebuild`（同一 workflow，`workflow_call`） | ~20         |

同一棵树、同一 SHA、同一批七个平台，编译两遍。

feature 分支的重复已经消除且不依赖任何跨工作流判断：`compiler-native.yml`
的 `push` 只保留 `main`，分支由 `pull_request` 触发。证据：43216543074（push）
与 43216552540（pull_request）是同一棵树 `179779a4`；43216215063 与
43216281805 是同一棵树 `6d71343f`。

---

## 2. 原实现为什么不够

### 2.1 run 存在 ≠ 构建成功

原查询只取 run 列表并计数：

```
repos/${GITHUB_REPOSITORY}/actions/workflows/release-canary.yml/runs?per_page=20
→ [.workflow_runs[] | select(.head_sha == COMMIT and .id != RUN_ID)] | length
```

以下每种情形都会让 `count > 0`，而七平台构建并未成功：

| 情形                                                        | 结果                         | 后果                                  |
| ----------------------------------------------------------- | ---------------------------- | ------------------------------------- |
| Canary 卡在 `release-preflight`，`native-prebuild` 尚未启动 | run 存在                     | main 跳过 → 该 SHA 无任何 native 验证 |
| Canary 被取消                                               | run 存在，`cancelled`        | 同上                                  |
| Canary 部分平台失败                                         | run 存在，一个平台 cancelled | 同上                                  |
| Canary re-run，只有 attempt 2 成功                          | run 存在                     | 无法区分 attempt                      |
| 同一 SHA 有历史 run（不同 event）                           | run 存在                     | 匹配到旧 run                          |

**`7d1031e4` 是本仓库内的活例**：

| Run                                                | Workflow               | 结果                                            |
| -------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| 43249739170                                        | Release Canary         | `failure`                                       |
| └ `native-prebuild / build (aarch64-apple-darwin)` |                        | **`cancelled`**，`runner_name: ""`，`steps: []` |
| 43249739185                                        | Compiler Native Matrix | `success`，七平台全过                           |

canary run **存在**，但它的七次构建里有一次从未执行。若当时去重生效，
main 会因"canary 已构建"而跳过 —— 而 canary 恰恰没构建成功。

### 2.2 权限不足会让它静默失效

`compiler-native.yml` 只声明 `permissions: contents: read`，而去重步骤用
`gh api` 查 Actions API。仓库里**另外五处**同类查询都显式声明了 `actions: read`：

```
component-host-bench.yml:35   actions: read
ci.yml:550                    actions: read
host-deployment-stage2.yml:101 actions: read
release.yml:27                actions: read
rc-approval.yml:44            actions: read
```

原代码把查询包在 `2>/dev/null || echo ""` 里，失败时走 `builds=false`。
行为上安全（回退到构建），但**去重从未真正启用**，而日志只会显示一条
"Could not query … building the matrix"，很容易被读成临时网络问题。

### 2.3 `native-prebuild` 是条件 job，且在下游

```yaml
native-prebuild:
  if: >-
    github.repository == 'baicie/zeus' &&
    (github.ref == 'refs/heads/main' || ...)
  needs: release-preflight
```

run 可以存在，而 `native-prebuild` 尚未开始、正在等 `release-preflight`、或被跳过。
这三种状态都不意味着七个平台构建过。

### 2.4 未区分 attempt 与历史

查询匹配任意 attempt 的任意 run。re-run、被取消的首次 attempt、
来自不同 event 的 run，全都满足条件。

---

## 3. 一个够用的实现必须满足什么

每条都要有**真实 Actions run 的证明**，不是推理。本 RFC 只给验收条件。

1. **身份精确匹配**：完整 40 位 `head_sha`、`event`、`workflow_id`、
   `run_attempt`（或显式声明只接受 attempt 1，失败即构建）。短 SHA 前缀不可接受。
2. **七个平台逐个可验证**：不能看 run 的 `conclusion`。必须列举 jobs，对每个目标平台断言
   `conclusion == 'success'` **且** `runner_name != ''`
   （`7d1031e4` 的 cancelled job 正是 `runner_name == ""`、`steps == []`）。
3. **artifact 属于正确 SHA**：每个平台一个 artifact，存在、未过期、可反查到该 SHA。
   仅"存在同名 artifact"不够 —— 名字是仓库内全局的。
4. **查询失败 = 构建**：非零退出、超时、JSON 解析失败、字段缺失都走构建分支，
   并且必须**显式区分**"确实没有 canary run"与"查不到"。原实现把两者合并，丢掉了这个区别。
5. **cancelled / failed 不影响 main 验证**：canary 的 `conclusion` 为
   `cancelled`、`failure`、`timed_out` 时，main 必须独立构建。
6. **其他入口不受影响**：`workflow_call`（`release.yml` tag push、
   `release-canary.yml`）、`workflow_dispatch` 三条路径都不得继承 skip。
   `workflow_call` 一旦被跳过，release 就拿不到 artifact。
7. **无死锁**：不得让 main 的 matrix 等待 canary 完成 —— canary 自身要用
   native artifact 才能继续。任何 `workflow_run` 等待式设计都必须证明不会互相等待。
8. **权限经过实测**：`actions: read` 必须真实加上，并在 CI 日志里证明查询成功
   （而不是走回退分支）。"加了权限所以应该能查"不算证明。

---

## 4. 本轮的处理

| 项                            | 状态                                |
| ----------------------------- | ----------------------------------- |
| feature 分支的 push/PR 重复   | **已消除**（`push` 只保留 `main`）  |
| main 独立 Native Matrix       | **保留**，不跳过                    |
| 跨工作流去重                  | **不启用**，移出本 PR               |
| `permissions: contents: read` | **不改** —— 不再有 Actions API 查询 |
| `workflow_call` 契约          | **不变**                            |
| 七个平台                      | **全部保留**                        |

## 5. 未确定事项

- `actions: read` 加在 `compiler-native.yml` 的 job 上是否足够查询
  `release-canary.yml` 的 runs —— **未在真实 Actions 上验证**。
- 七个平台的 artifact 归属如何精确匹配 —— 需要读
  `scripts/release/build-native-platform.ts` 的命名规则后才能设计，本 RFC 未做。
- 是否可用 `workflow_run` 事件替代 API 查询 —— 未评估死锁风险。

以上均标 `NOT_RUN`。在任何一项被真实 run 证明前，去重不应启用。
