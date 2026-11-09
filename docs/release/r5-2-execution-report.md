# R5.2 — Zeus Core 执行报告

日期：2026-11-09
状态：**READY_FOR_RC_CUT_REVIEW**（代码门禁已关闭；正式 RC Cut 仍被发布步骤与外部环境阻塞）

本文件只记录代码与门禁状态，不授权发布、打 Tag 或修改 dist-tag。

## 1. 基线

| 项目                               | 值                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Core main HEAD（审查基线，未移动） | `d93b4a0c3a346d51ae515286dea28158bfe0b643`                                       |
| Core PR-C 分支                     | `test/r52-cross-repo-workflow-integration`                                       |
| 分支基点                           | `d93b4a0c`（`origin/main`）                                                      |
| UI main HEAD（配对对象）           | `77f52c8be2310f6f88057c416011db75c0a70758`                                       |
| 本机 Node                          | 24.16.0                                                                          |
| Core 本地工作区                    | `git worktree` 于 `origin/main`，未污染用户现有 `codex/zeus-0.2.0-progress` 分支 |

用户仓库根目录的 `Cargo.toml` 存在一处**未提交的本地修改**（`
[profile.dev.package."*"] debug = false`）。该修改不属于本轮任务，未提交、未回退。

## 2. Phase 0/3：R5.1 发布链路复核

逐项核对了 R5.1 的修复在 `d93b4a0c` 上是否仍成立。结论：**R5.1 未出现回归**，以下契约在当前 HEAD 上均由代码与测试共同保证。

| 契约                                  | 证据                                                                                                                                                                                                                                            | 结论 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 伪造 Approval 不能放行                | `rc-approval.ts` `validateRcApproval` 要求 `schema`、`decision=APPROVED`、approver 白名单、时间窗；`verify-rc-approval.ts` 重新拉取 GitHub run 元数据                                                                                           | PASS |
| 证据与 Core/UI commit 绑定            | `validateRcApproval` 对比 `coreCommit`/`uiCommit`；`assemble-rc-evidence.ts` 要求 acceptance/transaction/provenance/pair 四方 commit 一致                                                                                                       | PASS |
| 与 workflow/actor/environment 绑定    | `validateApprovalSource` + `validateRunMetadata`：`workflowPath`、`workflowName`、`event=workflow_dispatch`、`actor`、`environment=Release` 全部比对                                                                                            | PASS |
| 与 artifact digest 绑定               | envelope 记录 payload artifact 的 API digest；`validateRunMetadata` 比对 `payloadArtifact.digest`；文件侧 `sha256File` 独立计算                                                                                                                 | PASS |
| Linux/Windows 不能用字符串 PASS 冒充  | `validatePlatformEntry` 要求 `status=PASS`、`sourceSha=headSha=commit`、非空 `jobs`（含数字 id 与 `conclusion=success`）、非空 `artifacts`（`sha256:<64 hex>`）、`tested` 覆盖 `typecheck/build/create-zeus/native-build`、`completedAt` 未过期 | PASS |
| Registry 查询失败不等同 latest 不存在 | `npm-registry.ts` `classifyNpmFailure` 仅 `E404` 记为 not-found；`check-latest-tags.ts` 返回 `REGISTRY_QUERY_FAILED` 并计入 `errors`                                                                                                            | PASS |
| UI checkout 使用审批中的完整 SHA      | `release.yml` 从 `rc-approval.json` 读 `uiCommit`，正则校验 40 位，`actions/checkout` 用该 SHA，`check:ui-pairing --require-commit` 校验 commit、版本、全部 pin、干净工作区                                                                     | PASS |
| Workspace restore 可恢复              | `deployment-workspace-restore.ts` 的 `phase` 状态机（prepared / previous-moved / switched / verified）与 `recoverInterruptedWorkspaceRestore`；`deployment-transaction-recovery.spec.ts` 覆盖                                                   | PASS |
| 发布失败/重试不破坏已有产物           | `@baicie/release` `skipExisting` + `check-latest-tags` + `release:verify:dist-tags`；`retry-release-tag` 只用 `zeusFixedPackages`                                                                                                               | PASS |
| RC evidence 不使用手写 URL            | `assemble-rc-evidence.ts` 的四个产品 URL 全部来自 `deployment-acceptance.json`，并要求 `ONLINE_ACCEPTED`、`ONLINE_PASS`、digest 与 transaction/provenance 一致                                                                                  | PASS |

按要求，R5.1 已正确解决的问题**未做重构**，避免为产生改动而改动。

### 2.1 本轮发现的跨仓库缺口

R5.1 的 `check:ui-pairing` 只校验 UI 工作区内部一致性（commit、版本、`@zeus-js/*` pin）。它**不校验 Core tag 是否真的指向该 Core commit**，也不要求 UI 侧存在一份可审计的配对记录。结果是：

- 只要 operator 在 UI dispatch 表单里填对版本字符串，UI 就能发布一个从未与 Core RC 配对过的版本；
- Core 侧无法从代码判断 UI 是否真的基于自己的 RC 候选构建。

这是 **P1**，已在 UI 仓库闭合（`release-pairing/<version>.json` + `check-release-pairing.ts`，见 UI 报告）。Core 侧本轮以**契约测试**锁定同一规则，确保 Core 的版本/channel 语义与 UI 认读的规则一致；未在 Core 增加重复的运行时门禁，避免两处实现漂移。

## 3. 代码变更与证据路径

PR-C（`test/r52-cross-repo-workflow-integration`）：

| 文件                                                   | 作用                      |
| ------------------------------------------------------ | ------------------------- |
| `scripts/release/__tests__/cross-repo-release.spec.ts` | 24 个跨仓库契约与恢复测试 |

测试覆盖：

1. **配对矩阵**：rc 同版本线通过；Core commit 不符、Core tag 被重打、UI 版本漂移、channel 不符、pin 过期全部失败；`@zeus-js/vite-plugin` 独立版本例外被允许但漂移失败；`beta` 允许缺记录而 `rc`/`latest` 必须有。
2. **版本与 channel**：`resolveReleaseVersion` 要求显式版本、tag、`@zeus-js/zeus` 三者一致；root `package.json` 仅告警；`v` 前缀归一化；四个 channel 映射互不相同，未知 prerelease 标识符返回 `undefined`。
3. **latest dist-tag 策略**：显式 404 → `LATEST_ABSENT`；超时/5xx/DNS/非字符串 → `REGISTRY_QUERY_FAILED` 并计入失败；prerelease `latest` 阻断 RC cut；`classifyNpmFailure` 只把 `E404` 当 not-found；重试有界且不 sleep。
4. **部分发布恢复**：模拟 `@baicie/release` 的 skip-existing 循环——首次失败只留下已成功包，重试跳过已发布版本、补齐剩余、绝不覆盖；恢复集合与固定发布组一致。
5. **证据绑定**：配对记录写盘再读回后仍能通过校验。

## 4. 测试命令与实际结果

在 Core worktree（`/tmp/zeus-main`，`origin/main` `d93b4a0c`）执行：

```
pnpm --filter @zeus-js/compiler-native build:native   # 本机缺少 native binding
pnpm exec vitest --run --project unit scripts/release/__tests__
```

实际结果：

- `scripts/release/__tests__/` — **34 个测试文件，320 项全部通过**，包含本轮新增的
  `cross-repo-release.spec.ts`（24 项）以及既有 `rc-approval.spec.ts`、
  `rc-approval-trust.spec.ts`、`assemble-rc-evidence.spec.ts`、`check-latest-tags.spec.ts`、
  `deployment-transaction-recovery.spec.ts`、`release-workflow.spec.ts`。

说明：仓库的 `vitest.config.ts` 通过 `scripts/testing/compile-test-views.ts` 载入
`@zeus-js/compiler-native`，该包需要本机 Cargo 构建产物。本轮先执行
`pnpm --filter @zeus-js/compiler-native build:native`（约 54s）生成
`zeus-compiler-native.darwin-arm64.node`，再用仓库原生配置运行，未使用隔离配置。

## 5. 未执行测试及原因

| 项目                                       | 原因                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| 仓库全量 `pnpm test-unit`（全部 4 个项目） | 本轮只运行了与发布契约直接相关的 `scripts/release/__tests__/`；全量套件由 CI 执行 |
| 真实 `release.yml` 运行                    | 需要推送 tag 并进入受保护 `Release` environment；无授权，`BLOCKED_BY_ENVIRONMENT` |
| 真实 npm publish / dist-tag 写入           | 操作红线禁止                                                                      |
| Linux/Windows 原生矩阵                     | 仅本机 macOS arm64；其余 `NOT_RUN`                                                |
| 真实 Stage 2 在线验收                      | 需要生产部署环境；`BLOCKED_BY_ENVIRONMENT`                                        |

## 6. RC 版本与 Core/UI 配对矩阵

| Core            | UI              | dist-tag | 配对记录  | 状态                                            |
| --------------- | --------------- | -------- | --------- | ----------------------------------------------- |
| `0.2.0-rc.0`    | `0.2.0-rc.0`    | `rc`     | UI 侧必需 | 契约已实现；Core tag 与 UI 记录待 RC cut 时创建 |
| `0.1.1-beta.20` | `0.1.0-beta.35` | `beta`   | 可省略    | 当前 main 状态                                  |
| `0.2.0`         | `0.2.0`         | `latest` | UI 侧必需 | 契约已实现                                      |

Core 固定发布组为 31 个包（`scripts/release.config.ts` `zeusFixedPackages`）。
UI 侧 `@zeus-js/vite-plugin` 固定 `0.0.5` 属于独立版本例外，不在该组内。

## 7. 剩余问题

- **P0**：无。
- **P1**：UI 侧 `@zeus-js/*` pin 仍为 `0.1.1-beta.20`，RC cut 时必须对齐并提交
  配对记录（发布步骤，不是缺陷）。
- **P1**：`check:latest-tags` 在 RC cut 前会因 13 个包的 `latest` 指向 prerelease
  而失败（RC-07）。修复需要 `repair:latest-tags --apply` 与 npm 写权限，属于
  人工授权操作；本轮未执行。
- **P2**：`rc-approval.yml` 使用 `actions/checkout@v5` 等 tag 形式的 action ref，
  而非 commit SHA。该 workflow 不受 Core 发布 workflow 的 pin 检查覆盖；收紧
  需要单独评估（workflow 自身改动会影响审批链，不宜与其他改动混在一起）。
- **P2**：`check:ui-pairing` 的 `uiVersion.includes('rc.')` 判断用字符串包含而非
  语义解析，对 `0.2.0-rcfoo` 这类非法版本会给出警告而非错误；UI 侧的新门禁
  已用严格 semver 解析覆盖该场景。

## 8. 环境/授权阻塞

- 推送 PR-C 分支并创建 Draft PR：允许。
- 触发 Core release workflow、创建 `v0.2.0-rc.0` tag：禁止，需维护者授权。
- 执行 `repair:latest-tags --apply`：禁止，需 npm 授权。
- 生产部署与在线验收：禁止，需维护者授权。

## 9. 下一阶段建议

1. 合并 UI 的 PR-A / PR-B。
2. Core 侧完成 `0.2.0-rc.0` 版本 commit 并跑完整 `release:precheck --channel rc`；
   其中 `check:latest-tags` 需要先关闭 RC-07 的 13 个 prerelease `latest`。
3. 打 `v0.2.0-rc.0`，随后 UI 对齐 pin 并提交配对记录。
4. 在隔离环境完成 tarball 安装 + create-zeus 六模板 + Verdaccio 发布演练后，
   再进入受保护的在线验收与人工审批。
