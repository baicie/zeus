# Zeus R11 — RC Cut Readiness & Release Trust Closure

日期：2026-11-15
执行前重新确认的基线

| 项                | 值                                         |
| ----------------- | ------------------------------------------ |
| Core main         | `8bf51db02bac42972e6b3ace43bd5f2b12f5a1b3` |
| UI main           | `89fc93cac5b97f29f48deb64964886476c5d7aac` |
| 开放 PR（开始时） | 0                                          |
| 正式 0.2.0        | 未发布                                     |
| RC verdict        | **NO_GO**                                  |

---

## 1. 交付的 PR

| PR                                              | 工作包                     | 状态  |
| ----------------------------------------------- | -------------------------- | ----- |
| [#296](https://github.com/baicie/zeus/pull/296) | T1 + T2 环境策略与可信证据 | Draft |
| [#297](https://github.com/baicie/zeus/pull/297) | T3 RC dry run 严格化       | Draft |
| [#298](https://github.com/baicie/zeus/pull/298) | T6 actionlint 门禁         | Draft |
| [#299](https://github.com/baicie/zeus/pull/299) | T4 Candidate Pairing       | Draft |
| 本报告                                          | T5 证据闭环                | Draft |

**没有合并任何 PR**，main 未改动。

### 1.1 T7 未实施

外部消费者矩阵（Terminal / OpsWeave）本轮**未开始**。理由：T1–T6 是 P0/P1，且 T7 依赖一个稳定的候选包集合——而候选版本尚未切换。零散开始会产生无法复用的证据。R10 已记录 Vite 7 的 ERESOLVE 实测结果，那是 T7 的起点。

---

## 2. Release Environment 当前保护状态

### 2.1 实测

```
$ gh api repos/baicie/zeus/environments/Release
{
  "can_admins_bypass": true,
  "protection_rules": [],
  "deployment_branch_policy": null
}
```

| 规则                | 状态       | 判定     |
| ------------------- | ---------- | -------- |
| Required reviewers  | `[]`       | **FAIL** |
| Prevent self-review | 规则不存在 | **FAIL** |
| Admins can bypass   | `true`     | **FAIL** |
| Branch/tag policy   | `null`     | **FAIL** |

四条全部违反 `zeus.release-policy/v1`。PR #296 之前，其中两条只出现在 pass 消息里，不导致失败。

### 2.2 使用该环境的五个 workflow

```
devtools-release.yml, release.yml, rc-approval.yml,
repair-dist-tags.yml, repair-native-latest.yml
```

后两个会改 npm dist-tag，保护同样为零。

---

## 3. 可信审批证据的生成方式

### 3.1 为什么普通 CI 不能读

`GET /repos/{owner}/{repo}/environments/{name}` 需要 **Administration** 权限。`GITHUB_TOKEN` 没有任何 scope 授予它——不是「权限不够」，是**不存在这个键**。`administration` 不是合法的 workflow `permissions` key；写入它会让整个文件失效（`#292` 的实测：run 在 0 秒失败、零 job、`gh pr checks` 不报失败）。

### 3.2 Bootstrap 方案

信任根是**维护者配置环境**。这一点无法由代码替代，也不应尝试。

1. 维护者配置保护（required reviewers、prevent self-review、取消 admin bypass、tag-only ref）
2. 独立核验（下一节的 governance workflow）
3. 才允许受保护的发布验证工作流执行

### 3.3 实现

`.github/workflows/release-governance.yml`：`workflow_dispatch` only、钉在 `Release` 环境、使用仓库 secret `ZEUS_GOVERNANCE_TOKEN`（带 Administration read）。**PR 无法触达**。

它写出的记录绑定：

```
repository, environment, workflowPath, runId, runAttempt,
coreCommit, observedAt, policyVersion, observed, verdict
```

`release:precheck` 通过 `readRcReadinessInput` 验证全部绑定。为另一个 commit、另一个仓库、另一个 workflow、旧策略产出的 PASS 会被按名字拒绝。超过 `ZEUS_RELEASE_ENVIRONMENT_MAX_AGE_HOURS`（默认 24）的记录必须重读。

**这避免了循环信任**：不是「一个未受保护的 job 宣称自己受保护」，而是一个独立的、受限的 workflow 读取真实配置，并把结论绑定到具体 run 与具体 commit。

### 3.4 标记为 POLICY_LIMITATION 的一项

GitHub 把 custom branch patterns 放在第二个端点（`/environments/{name}/deployment-branch-policies`）。读取失败时，限制**存在但内容未知**。这种情况返回 `POLICY_LIMITATION`——不是 PASS，也不是 FAIL，而是「无法用现有证据验证」。判定优先级 `FAIL > POLICY_LIMITATION > PASS`。

---

## 4. 0.2.0-rc.0 真实隔离 Dry Run

### 4.1 已完成的部分

`release:rc-dry-run`（PR #297）现在：

| 检查                                               | 状态   |
| -------------------------------------------------- | ------ |
| Core/UI checkout HEAD 等于候选 SHA                 | 已实现 |
| 两个 checkout 在严格模式下必需                     | 已实现 |
| 32 个 Core 包版本一致                              | 已实现 |
| 46 个 UI 包版本一致                                | 已实现 |
| UI 对 Core 的 `dependencies` 与 `peerDependencies` | 已实现 |
| Registry UNKNOWN 阻断                              | 已实现 |
| 版本冲突检测                                       | 已实现 |
| 三个首发包独立风险报告                             | 已实现 |

### 4.2 实测

```
RC dry run (release-strict) for 0.2.0-rc.0
  core: 8bf51db0… (checkout 8bf51db0…)
  ui:   89fc93ca… (checkout 89fc93ca…)
  first publish: @zeus-js/i18n@0.2.0-rc.0 — never published; an RC first
    publish does not bind latest, but the dist-tag must be set explicitly
  （eslint-plugin、playground-engine 同）

NO_GO:
  - Core manifests are at 0.1.1-beta.20, but the plan cuts 0.2.0-rc.0
  - UI manifests are at 0.1.0-beta.35, but the plan cuts 0.2.0-rc.0
  - @zeus-web/zeus-compat peerDependencies pins @zeus-js/zeus at 0.1.1-beta.20
```

### 4.3 未完成：真实版本切换模拟

任务要求的隔离 worktree 演练——**把两棵树切到 `0.2.0-rc.0`、重建、打 tarball、在独立消费者安装**——**没有完成**。

这是本轮最大的缺口，不应用「dry run 已实现」掩盖。当前脚本只读取现有树；它证明了「现在的树不是 RC」，没有证明「切到 RC 之后能工作」。

---

## 5. Core 32 包 / UI 46 包版本矩阵

### 5.1 Core

| 项             | 值                                 |
| -------------- | ---------------------------------- |
| 包数           | 32（`zeusFixedPackages` 精确匹配） |
| 版本           | 全部 `0.1.1-beta.20`，唯一值       |
| Rust workspace | 存在，版本与 Core 一致             |
| Native         | 7 个平台包                         |

### 5.2 UI

| 项                  | 值                           |
| ------------------- | ---------------------------- |
| 包数                | 46                           |
| 版本                | 全部 `0.1.0-beta.35`，唯一值 |
| **tag**             | **`v0.1.0-beta.35` 不存在**  |
| registry            | 最高 `0.1.0-beta.34`         |
| 对 Core 的 peer pin | `0.1.1-beta.20`              |

**beta.35 是未发布的开发版本**：版本号改了，没打 tag，没发布。按决策 B，不补发、不回退，下次直接切 RC。

---

## 6. 新包首次发布风险

三个包从未发布：`@zeus-js/i18n`、`@zeus-js/eslint-plugin`、`@zeus-js/playground-engine`。

| 场景                            | `latest` 行为                            |
| ------------------------------- | ---------------------------------------- |
| 首发 `0.2.0-rc.0`（prerelease） | **不绑定** latest，但必须显式 `--tag rc` |
| 首发 `0.2.0`（稳定版）          | **绑定** latest——npm 与 `--tag` 无关     |

RC 首发是安全的，前提是 dist-tag 显式设置。dry run 逐包报告这一点。

---

## 7. 原生七平台结果

`Compiler Native Matrix` 在 `8bf51db0` 上 **7/7 success**：

```
compiler-native-darwin-arm64, -darwin-x64,
-linux-arm64-gnu, -linux-x64-gnu, -linux-x64-musl,
-win32-arm64-msvc, -win32-x64-msvc
```

---

## 8. Packed consumer 与浏览器结果

### 8.1 本地证据 STALE

```
temp/packed-consumers/report.json -> 69f494f2  (HEAD 是 8bf51db0)
temp/create-zeus/report.json      -> 69f494f2
```

两份报告落后 HEAD 多个合并。**不能用它们证明当前状态。**

### 8.2 CI 上的证据

`8bf51db0` 的 CI 里 `packed-consumers` job success，包含 React 18/19 与 Vue 3 的 packed consumer 检查，以及 `browser-web-components`（Chromium/Firefox/WebKit）。

但这证明的是 **`8bf51db0` 上的 packed consumer 通过**，不是 RC 候选的。

---

## 9. 最新 RC manifest

`docs/release/0.2.0-rc-manifest-candidate.json`，绑定 `8bf51db0`（已核实与 HEAD 一致），verdict **NO_GO**。

历史 manifest `docs/release/0.2.0-rc-manifest.json`（审计期 `7bc850b7`）**未改动**——`rc-manifest.ts` 拒绝写入它。

---

## 10. 未解决的 blocker

| #   | blocker                                   | 责任方         | 所需动作                                           |
| --- | ----------------------------------------- | -------------- | -------------------------------------------------- |
| 1   | Release 环境无 required reviewers         | 维护者         | Settings → Environments → Release → 添加 reviewers |
| 2   | 允许 self-review                          | 维护者         | 同上，勾选 Prevent self-review                     |
| 3   | `can_admins_bypass: true`                 | 维护者         | 同上，取消 Allow administrators to bypass          |
| 4   | 无 branch/tag 限制                        | 维护者         | 同上，设 custom policy 为 `refs/tags/v*`           |
| 5   | `ZEUS_RC_APPROVERS` 不存在                | 维护者         | 创建仓库变量（`release:precheck` 会 fail-closed）  |
| 6   | `ZEUS_GOVERNANCE_TOKEN` 不存在            | 维护者         | 创建带 Administration read 的 token secret         |
| 7   | 版本未切 `0.2.0-rc.0`                     | 维护者         | 决策后切版本                                       |
| 8   | UI `beta.35` 有版本无 tag                 | 维护者         | 决策：补 tag 或按 B 直接切 RC                      |
| 9   | UI peer pin 是 `0.1.1-beta.20`            | 维护者 + UI 仓 | 切 RC 时同步                                       |
| 10  | build-info 记录 ui `ffde5592`             | 维护者         | 更新 `ZEUS_UI_COMMIT` 到真实配对值                 |
| 11  | packed-consumers / create-zeus 证据 STALE | 工程           | 重跑对应门禁                                       |
| 12  | cross-platform evidence 缺失              | 工程           | 需 CI artifact                                     |
| 13  | Stage 2 在线验收未运行                    | 维护者         | 需授权部署                                         |
| 14  | release approval 未产生                   | 阻塞于 #1–#4   | 环境修好后可产生                                   |
| 15  | 回滚记录未产生                            | 工程           | 需演练                                             |
| 16  | **真实版本切换模拟未完成**                | 工程           | 隔离 worktree 切版本 + 重建 + 打包 + 消费者安装    |

---

## 11. GO / NO_GO 判定

**NO_GO。**

四条独立理由，任一条都足以否决：

1. **审批保护不存在**。环境四项配置全部不设防，两个会改 dist-tag 的 workflow 共用它。
2. **版本未切换**。Core 与 UI 都停在 beta。
3. **UI peer pin 未更新**。`0.1.1-beta.20` 与 RC 不匹配。
4. **版本切换模拟未完成**。没有人验证过切到 RC 之后两棵树能否构建、打包、被消费者安装。

---

## 12. 维护者需要执行的最小操作

按「先做哪个能解锁下一步」排序。

| 序  | 操作                                                       | 解锁                                   |
| --- | ---------------------------------------------------------- | -------------------------------------- |
| 1   | Release 环境加 required reviewers + Prevent self-review    | blocker 1–2                            |
| 2   | 取消 Allow administrators to bypass                        | blocker 3                              |
| 3   | 设 branch policy 为 `refs/tags/v*`                         | blocker 4                              |
| 4   | 创建 `ZEUS_RC_APPROVERS` 变量                              | blocker 5                              |
| 5   | 创建 `ZEUS_GOVERNANCE_TOKEN` secret（Administration read） | blocker 6，使 governance workflow 可用 |
| 6   | 决定 UI `beta.35`：补 tag 或直接切 RC                      | blocker 8                              |
| 7   | 授权切 `0.2.0-rc.0` + UI 重建                              | blocker 7、9                           |
| 8   | 更新 `ZEUS_UI_COMMIT` 到真实配对值                         | blocker 10                             |

第 1–5 项是纯配置。第 6–8 项需要决策。

**六项之后**，工程侧仍需完成 blocker 11–16 才能进入 RC Cut。
