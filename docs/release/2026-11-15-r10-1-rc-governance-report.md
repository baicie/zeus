# Zeus R10.1 — RC Governance Closure 报告

日期：2026-11-15
执行前重新确认的基线（不用历史 SHA）

| 项                | 值                                         |
| ----------------- | ------------------------------------------ |
| Core main         | `6bbcf081901331aeefac09edd64a7010d27be86e` |
| UI main           | `89fc93cac5b97f29f48deb64964886476c5d7aac` |
| 开放 PR（开始时） | 0                                          |
| 正式 0.2.0        | 未发布                                     |
| RC 判断           | NO_GO                                      |

---

## 1. 最新 SHA 与工作流

Core HEAD `6bbcf081` 上：

| Workflow               | 结果                                                            |
| ---------------------- | --------------------------------------------------------------- |
| CI                     | success（13/13 job）                                            |
| Compiler Native Matrix | success（**7/7 平台**）                                         |
| Release Canary         | success（preflight + dry-run；`release-canary` 按契约 skipped） |
| Docs                   | success                                                         |

npm dist-tags（实测）：`@zeus-js/zeus` latest=`0.1.0`、beta=`0.1.1-beta.20`；
`@zeus-web/button` latest=`0.1.0-beta.0`、beta=`0.1.0-beta.34`。

---

## 2. T1 — 环境检查鉴权接线

**PR [#292](https://github.com/baicie/zeus/pull/292)**，commit `975cbe7d`。

### 2.1 缺陷（CONFIRMED）

`readReleaseEnvironment` 用 `catch { return undefined }` 把六种情况塌缩成一个值：

| 情况               | 性质         |
| ------------------ | ------------ |
| token 缺失         | 未回答的问题 |
| token 权限不足     | 未回答的问题 |
| environment 不存在 | 未回答的问题 |
| `gh` 未安装        | 未回答的问题 |
| 网络失败           | 未回答的问题 |
| 环境确实无保护     | **策略结论** |

前五种与第六种报同一个 `not_run`，就是把「没看」和「看了，没有」混为一谈。

### 2.2 修复

六态 union：`read` / `not_configured` / `unauthorized` / `network_error` / `tool_missing` / `skipped`。

`read` 现在携带 `preventsSelfReview`、`adminsCanBypass`、`branchPolicy`。

`gh` 显式接收 `GH_TOKEN`，不再依赖继承。

### 2.3 权限

| 文件                        | 改动                                                     |
| --------------------------- | -------------------------------------------------------- |
| `ci.yml` `packed-consumers` | job 级 `administration: read`（只读）+ 步骤级 `GH_TOKEN` |
| `release.yml` release job   | 同权限 + `release:precheck` 步骤 `GH_TOKEN`              |

全局默认仍是 `contents: read`。无 PAT、无写级权限、token 不落日志。

### 2.4 实测

| 条件   | 输出                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| 无凭据 | `could not be read (unauthorized: no GH_TOKEN or GITHUB_TOKEN…)` → `not_run` |
| 有凭据 | `requires no reviewer` → `fail`                                              |

### 2.5 一致性

`release:precheck` 调用 `check:rc-readiness --release-snapshot`，与 CI 跑**同一个脚本**。两条路径不可能对「环境是否受保护」给出不同答案。

### 2.6 测试

`scripts/check/` **220 passed**，其中 11 项用注入的 `gh` 直接驱动探测函数（不是 mock `readReleaseEnvironment`）。

---

## 3. T2 — 审批保护完整性

完整清单见 `docs/release/2026-11-15-release-environment-checklist.md`。

### 3.1 实测

```
gh api repos/baicie/zeus/environments/Release
{
  "can_admins_bypass": true,
  "protection_rules": [],
  "deployment_branch_policy": null
}
```

| 检查项              | 现状                  | 判定     |
| ------------------- | --------------------- | -------- |
| Required reviewers  | `[]`                  | **FAIL** |
| Prevent self-review | 规则不存在            | **FAIL** |
| 管理员能否绕过      | `true`                | **FAIL** |
| 允许的分支/Tag      | `null`（无限制）      | **FAIL** |
| 绑定不可变 SHA      | 是                    | **PASS** |
| 审批人符合授权策略  | 只校验 admin/maintain | **部分** |
| 有效期              | 48h 默认，最大 72h    | **PASS** |
| 撤销策略            | **不存在**            | **FAIL** |

### 3.2 与 Canary 对照

Canary 至少有一个 `branch_policy`。Release 连这个都没有——**发布路径的保护弱于预发路径**。

### 3.3 使用 Release 的五个 workflow

```
devtools-release.yml, release.yml, rc-approval.yml,
repair-dist-tags.yml, repair-native-latest.yml
```

后两个会改 npm dist-tag，保护同样为零。

### 3.4 `ZEUS_RC_APPROVERS` 不存在

`release.yml` 引用它，但 13 个仓库变量里没有。`assemble-rc-evidence.ts` 对空值 `throw new Error('--approvers is required')`——**fail-closed，不是静默放行**。这一点是正确的，但也意味着在变量配置前正式发布无法进行。

### 3.5 审批工作流本身是对的

`rc-approval.yml` 绑定运行 SHA、检出、证据 run id、TTL、Sigstore attestation。**问题不在 workflow，在它依赖的环境不拦人。**

---

## 4. T3 — 0.2.0-rc.0 Dry Run

**PR（待建）**，`scripts/release/rc-dry-run.ts`。

### 4.1 结果

```
RC dry run for 0.2.0-rc.0
  core: 6bbcf081901331aeefac09edd64a7010d27be86e
  ui:   89fc93cac5b97f29f48deb64964886476c5d7aac
  dist-tag: rc
  first publish (would create latest): @zeus-js/i18n,
    @zeus-js/eslint-plugin, @zeus-js/playground-engine

NO_GO:
  - manifests are at 0.1.1-beta.20, but the plan cuts 0.2.0-rc.0;
    the version bump has not happened
  - UI pins @zeus-js/zeus at 0.1.1-beta.20, but Core is cutting 0.2.0-rc.0;
    UI must be rebuilt against the RC
```

### 4.2 首发包污染规则

三个包从未发布。npm 把 `latest` 绑定到名字的首次发布版本，与 `--tag` 无关。因此**稳定版**首发会让它们成为所有人的默认安装：

```
--version 0.2.0
  - @zeus-js/i18n has never been published and 0.2.0 is not a prerelease;
    its first publish would become latest
  （eslint-plugin、playground-engine 同）
```

RC 首发（`0.2.0-rc.0` 含连字符）不触发此规则——脚本区分两者，不是一律警告。

### 4.3 检查项

- 候选 commit 是全 SHA，不是 `main`
- 所有发布包版本一致，且等于要切的版本
- `zeusFixedPackages` 每个都有 manifest
- UI 依赖彼此一致
- UI 对 `@zeus-js/zeus` 的 peer pin 等于要切的 Core 版本
- 发布顺序 Core → UI → consumers

Registry 查询区分 404（从未发布）与其他失败（报 unknown，不两可计数）。

### 4.4 回滚条件与不可回滚事项

| 事项             | 可回滚？                                    |
| ---------------- | ------------------------------------------- |
| Core RC 包发布   | 可（`npm unpublish` 72h 内，或发补丁版本）  |
| **首发的三个包** | **不可回滚到「未发布」**——`latest` 已被绑定 |
| dist-tag 指向    | 可（重新指向，或 `repair:latest-tags`）     |
| Tag              | 不建议删除（会破坏已发布的引用）            |

### 4.5 GO/NO_GO

**NO_GO**，两条：版本未切换、UI 未针对 RC 重建。

---

## 5. T4 — UI 配对语义

**PR [#293](https://github.com/baicie/zeus/pull/293)**，commit `23ccd5ee`。

### 5.1 四个不同的事实

| 概念                                   | SHA        | 性质                       |
| -------------------------------------- | ---------- | -------------------------- |
| `approvedUiCommit`（`ZEUS_UI_COMMIT`） | `ffde5592` | 声明，本仓库无法验证       |
| `actualPackageSourceCommit`            | `a8826dd1` | beta.34，来自 SLSA         |
| `uiMainHead`                           | `89fc93ca` | 领先 beta.34 **29 个提交** |
| `vendoredSourceCommit`                 | `74662b61` | `vendor/zeus-web-dialog`   |

`ffde5592` 比 `a8826dd1` **新 14 个提交**——不是同一物的旧名，是一个没有任何已发布包由它构建的提交。

### 5.2 记录与校验

`docs/release/0.2.0-ui-pairing.json`（`zeus.ui-pairing/v1`），从真实树生成，24/24 包 integrity 齐全，校验 **0 问题**。

`validatePairingRecord` 拒绝「包来源 == 批准 commit」：

```
package source equals the approved commit ffde5592…; the approved commit must
not be presented as the package source
```

这正是粗心生成器会产出的形状——两个字段都从同一变量填，也正是读者最希望为真的声明。

### 5.3 没有动

`ZEUS_UI_COMMIT` 仍是 `ffde5592`。改生产变量超出授权。

---

## 6. T5 — 证据收集

### 6.1 各证据状态

| 证据                           | 状态                                        | 绑定 commit    | 判定                              |
| ------------------------------ | ------------------------------------------- | -------------- | --------------------------------- |
| CI（`6bbcf081`）               | success 13/13                               | `6bbcf081`     | **PASS**                          |
| 七平台 Native Matrix           | success 7/7                                 | `6bbcf081`     | **PASS**                          |
| Release Canary                 | success                                     | `6bbcf081`     | **PASS**                          |
| Docs                           | success                                     | `6bbcf081`     | **PASS**                          |
| SBOM                           | `temp/sbom/zeus.cdx.json`，官方 schema 通过 | 本地生成       | **PASS**（覆盖范围见 §6.3）       |
| SLSA verified provenance       | **24/24**，真实 Sigstore 验证               | `a8826dd1`     | **PASS**                          |
| Packed Consumers               | `temp/packed-consumers/report.json`         | **`69f494f2`** | **STALE**                         |
| Create Zeus                    | `temp/create-zeus/report.json`              | **`69f494f2`** | **STALE**                         |
| Cross Platform Evidence        | `temp/release/rc-evidence.json`             | —              | **NOT_RUN**（需 CI artifact）     |
| Release environment protection | 读取成功                                    | 实时           | **FAIL**（无 required reviewers） |
| Stage 2 在线验收               | —                                           | —              | **NOT_RUN**                       |
| Release approval               | —                                           | —              | **NOT_RUN**                       |
| 真实回滚记录                   | —                                           | —              | **NOT_RUN**                       |

### 6.2 STALE 的含义

`packed-consumers` 与 `create-zeus` 的本地报告绑定 `69f494f2`，而当前 HEAD 是 `6bbcf081`。两者相隔多个合并。**不能用它们证明当前状态。** 需要重新运行这两个门禁才能更新。

### 6.3 SBOM 覆盖范围（不声称完整）

```
zeus:sbom:coverage                = workspace-and-direct-runtime
zeus:sbom:transitive-dependencies = not-modelled
```

lockfile 490 个包名 vs SBOM 85 个组件。传递依赖未建模。

### 6.4 历史 manifest 保留

`docs/release/0.2.0-rc-manifest.json`（审计期 `7bc850b7`）未改动。`rc-manifest.ts` 拒绝写入它。当前候选是 `0.2.0-rc-manifest-candidate.json`。

---

## 7. RC Blockers（完整）

| 类别                 | blocker                                        | 可自行解决？                     |
| -------------------- | ---------------------------------------------- | -------------------------------- |
| **manual approval**  | Release 环境无 required reviewers              | 否（需 admin）                   |
| **manual approval**  | Release 环境允许 self-review                   | 否                               |
| **manual approval**  | `can_admins_bypass: true`                      | 否                               |
| **manual approval**  | 无 branch/tag 限制                             | 否                               |
| **manual approval**  | 无撤销策略                                     | 否（需设计）                     |
| **release process**  | `ZEUS_RC_APPROVERS` 不存在                     | 否（改仓库变量）                 |
| **release process**  | 版本仍是 `0.1.1-beta.20`，未切 `0.2.0-rc.0`    | 否（需授权切版本）               |
| **release process**  | UI peer pin 是 `0.1.1-beta.20`，未针对 RC 重建 | 否（需 UI 仓配合）               |
| **release process**  | 3 个包首发，RC 后会绑定 latest                 | 是（已在 dry run 中检测）        |
| **environment**      | 三个 build-info 记录 ui `ffde5592`，非实际来源 | 否（改 `ZEUS_UI_COMMIT` 需授权） |
| **evidence stale**   | packed-consumers 绑定 `69f494f2`               | 是（重跑门禁）                   |
| **evidence stale**   | create-zeus 绑定 `69f494f2`                    | 是（重跑门禁）                   |
| **evidence missing** | cross-platform                                 | 否（需 CI artifact）             |
| **evidence missing** | stage 2 在线验收                               | 否（需真实部署 + 授权）          |
| **evidence missing** | release approval                               | 否（需环境先修好）               |
| **evidence missing** | 真实回滚记录                                   | 否（需演练）                     |

---

## 8. 是否具备正式 RC Cut 条件

**否。**

三条独立理由，任一条都足以否决：

1. **审批保护不存在。** 环境三处配置全部不设防。`rc-approval` 产物是自证。
2. **版本未切换。** dry run 明确报告 manifests 仍是 `0.1.1-beta.20`。
3. **UI 未针对 RC 重建。** peer pin 仍是 `0.1.1-beta.20`。

---

## 9. 需要维护者执行的最小操作

按「先做这个就能解锁下一步」排序。

| 序  | 操作                                                          | 解锁                        |
| --- | ------------------------------------------------------------- | --------------------------- |
| 1   | 给 `Release` 加 required reviewers + 勾选 Prevent self-review | 所有审批相关 blocker        |
| 2   | 取消 `Allow administrators to bypass`                         | 审批无法绕过                |
| 3   | 加 branch policy（只允许 `main` 与 `refs/tags/v*`）           | 部署来源可控                |
| 4   | 创建 `ZEUS_RC_APPROVERS` 变量                                 | `release:precheck` 可通过   |
| 5   | 决定 UI `beta.35`：补 tag 发布，或回退版本号                  | 配对语义确定                |
| 6   | 更新 `ZEUS_UI_COMMIT` 到真实配对值                            | build-info 不再记录错误来源 |
| 7   | 授权切 `0.2.0-rc.0` 版本 + UI 重建                            | dry run 可转 GO             |

第 1–4 项是纯配置，不需要改代码。第 5–7 项需要决策。

---

## 10. 本轮交付的 PR

| PR                                              | 内容                  | 测试                             |
| ----------------------------------------------- | --------------------- | -------------------------------- |
| [#292](https://github.com/baicie/zeus/pull/292) | T1 环境检查鉴权       | 220 passed（`scripts/check/`）   |
| [#293](https://github.com/baicie/zeus/pull/293) | T4 配对语义 + T2 清单 | 544 passed（`scripts/release/`） |
| （待建）                                        | T3 dry run            | 544 passed                       |

全部 Draft。全部：`tsc --noEmit` clean、`prettier --check .` clean。

`scripts/**` 与 `.github/workflows/**` 在镜像 paths 内，**合并会触发生产部署**。
