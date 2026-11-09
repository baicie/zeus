# R5.2 — Zeus Core 执行报告

日期：2026-11-09
状态：**READY_FOR_RC_CUT_REVIEW**（代码门禁已关闭；正式 RC Cut 仍被发布步骤与外部环境阻塞）

本文件只记录代码与门禁状态，不授权发布、打 Tag 或修改 dist-tag。

## 1. 基线

| 项目                               | 值                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| Core main HEAD（审查基线，未移动） | `d93b4a0c3a346d51ae515286dea28158bfe0b643`                                                       |
| Core PR-C 分支                     | `test/r52-cross-repo-workflow-integration`（PR [#220](https://github.com/baicie/zeus/pull/220)） |
| 分支基点                           | `d93b4a0c`（`origin/main`）                                                                      |
| UI main HEAD（配对对象）           | `77f52c8be2310f6f88057c416011db75c0a70758`                                                       |
| 本机 Node                          | 24.16.0                                                                                          |
| Core 本地工作区                    | `git worktree` 于 `origin/main`，未污染用户现有 `codex/zeus-0.2.0-progress` 分支                 |

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

## 4.1 隔离环境真实 RC 演练（Phase 4）

在干净 worktree（`/tmp/zeus-rehearsal`，`origin/main` `d93b4a0c`，无未提交改动）上执行：

```
node scripts/release/build-native-platform.ts --target aarch64-apple-darwin
tsx scripts/release/rc-rehearsal.ts --version 0.2.0-rc.0 \
  --expect-head d93b4a0c3a346d51ae515286dea28158bfe0b643 \
  --ui-root <zeus-ui checkout>
```

结果：**REHEARSAL_PASS，17/17 步**。

| 步骤                                                | 结果 | 证据                                                                  |
| --------------------------------------------------- | ---- | --------------------------------------------------------------------- |
| preflight-clean / head / version                    | PASS | HEAD 与 `--expect-head` 一致，版本为合法 RC                           |
| version-rewrite                                     | PASS | 37 个文件、46 处编辑，演练后完整恢复                                  |
| ui-pin-sync                                         | PASS | 1 个模板文件同步到配对 UI `0.1.0-beta.35`                             |
| install / build / build-dts                         | PASS | 真实 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm build-dts` |
| check-package-versions / check-create-zeus-versions | PASS |                                                                       |
| candidate-prepare                                   | PASS | 32 个 Core 候选包全部打包                                             |
| ui-install / ui-build-button                        | PASS | UI 用 Core 候选 tarball 真实安装并构建                                |
| candidate-matrix                                    | PASS |                                                                       |
| tarball-validation                                  | PASS | **32/32 tarball 均为 `0.2.0-rc.0`**                                   |
| restore / verify-clean                              | PASS | 工作区恢复干净                                                        |

`temp/release/rc-rehearsal.json` 记录：`version=0.2.0-rc.0`、
`uiVersion=0.1.0-beta.35`、`coverage.mode=all-six-templates`、
`environment={platform:darwin,arch:arm64,node:v24.16.0}`。

### 4.2 create-zeus 六模板（真实安装 + 构建）

| 模板                   | 结果 | 安装版本                                                                                      |
| ---------------------- | ---- | --------------------------------------------------------------------------------------------- |
| `basic-ts`             | PASS | `@zeus-js/zeus 0.2.0-rc.0`                                                                    |
| `application-ts`       | PASS | `@zeus-js/zeus 0.2.0-rc.0`                                                                    |
| `admin-ts`             | PASS | `@zeus-js/zeus 0.2.0-rc.0`                                                                    |
| `web-component-ts`     | PASS | `@zeus-js/zeus 0.2.0-rc.0`                                                                    |
| `component-library-ts` | PASS | 产出 `custom-elements.json`、`zeus.components.json`、`wc/*`、`react/index.js`、`vue/index.js` |
| `webc-consumer-ts`     | PASS | `@zeus-web/button 0.1.0-beta.35`                                                              |

全部从隔离的候选 tarball 安装并构建，不是 mock。

### 4.3 隔离 npm Registry 发布演练（Verdaccio 6.11.1）

`docker run verdaccio/verdaccio:6` 于 `127.0.0.1:4873`，独立存储目录，无 uplink，
**与 registry.npmjs.org 完全隔离**。用真实候选 tarball 发布：

| 场景                                | 结果                                              |
| ----------------------------------- | ------------------------------------------------- |
| 首次 `npm publish --tag rc`         | 成功，`rc` dist-tag 指向 `0.2.0-rc.0`             |
| 重复发布同一版本                    | `EPUBLISHCONFLICT`（npm 拒绝覆盖）                |
| 不可达 registry（`127.0.0.1:4999`） | 预检 46/46 包 `FAILED`，整体 FAIL，未产生任何发布 |

**关键实证**：首次发布时 npm 即使收到显式 `--tag rc`，也会把 `latest` 一并
指向 `0.2.0-rc.0`。四个被测包的 `dist-tags` 都是
`{"latest":"0.2.0-rc.0","rc":"0.2.0-rc.0"}`。这**证实了 RC-07 的根因**，也说明
“RC 发布绝不意外修改 npm latest”必须依赖发布后的 `repair:latest-tags`，
或对首次发布额外处理，而不能只靠 `--tag`。

`scripts/release/isolated-registry-drill.ts`（本轮新增）把该演练固化为可复现脚本：
拒绝在生产 registry 上运行、校验 tarball 版本、记录每个包的发布退出码 /
dist-tags / 重复发布结果 / 故障状态，并把“首次发布污染 latest”作为 finding 输出。

对该脚本与 UI 新增的 `check-publish-preflight.ts` 都做了真实 registry 验证：
可达时 46 个包报 `ABSENT`、预检 PASS；registry 宕机时 46 个包全部 `FAILED`、预检 FAIL。

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

## 6.1 RC-07 的新证据（P1，未关闭）

隔离 registry 演练给出了 RC-07 的具体机制：**npm 在发布某包的第一个版本时，
即使显式传 `--tag rc`，也会把 `latest` 一并指向该版本**。实测四个候选包发布后
`dist-tags` 均为 `{"latest":"0.2.0-rc.0","rc":"0.2.0-rc.0"}`。

这意味着 RC cut 的放行条件必须包含：

1. 首次 RC 发布后，`check:latest-tags` 会因为 `latest` 指向 prerelease 而失败；
2. 必须用受保护的 `repair:latest-tags --apply` 把 `latest` 修回上一个稳定版本；
3. 该修复需要 npm 写权限与维护者授权，本轮**未执行**。

`isolated-registry-drill.ts` 把该行为记录为 finding，避免下一位执行者把它当成
“`--tag` 写错了”。

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

- 推送 PR-C 分支并创建 Draft PR：已执行（[#220](https://github.com/baicie/zeus/pull/220)）。
- 触发 Core release workflow、创建 `v0.2.0-rc.0` tag：禁止，需维护者授权。
- 执行 `repair:latest-tags --apply`：禁止，需 npm 授权。
- 生产部署与在线验收：禁止，需维护者授权。

## 8.1 四产品联合验收（Phase 5）

状态标签严格区分。全部为**在 `d93b4a0c` 上本机真实执行**，不是 mock，也不是
把历史报告里的 PASS 直接搬过来。

| 产品                      | 检查                            | 状态                | 说明                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin                     | `check:admin`（真实浏览器）     | **LOCAL_VALIDATED** | chromium / firefox / webkit 三引擎全部 passed：query、filtering、pagination、selection、UI components、navigation、permissions；三引擎 DevTools graph / timeline / refresh / cleanup 也全部 passed，dev 导航返回 200 且建立 session |
| Native Lab / Playground   | `check:playground-editor`       | 见下                | 需要 wasm 编译器构建，另有一次独立运行                                                                                                                                                                                              |
| AI Workbench              | `check:ai-workbench`（zeus-ui） | **LOCAL_VALIDATED** | chromium / firefox / webkit 全部 passed：chat、SSE、approval、write                                                                                                                                                                 |
| WebC Studio               | 同一 Playground 应用            | 见下                | 与 Native Lab 共用 Playground 证据                                                                                                                                                                                                  |
| 可访问性（自动）          | `check:a11y-browser`            | **LOCAL_VALIDATED** | 自动 axe 扫描通过（3 项 passed）                                                                                                                                                                                                    |
| 可访问性（人工）          | VoiceOver / NVDA                | **NOT_RUN**         | 需要真实人工执行与录音证据；未伪造                                                                                                                                                                                                  |
| 在线四产品                | Stage 2 部署验收                | **NOT_RUN**         | 需要生产环境与部署授权，`BLOCKED_BY_ENVIRONMENT`                                                                                                                                                                                    |
| Linux / Windows 矩阵      | Product Acceptance workflow     | **NOT_RUN**         | 需要 GitHub Actions 运行；本机仅 macOS arm64                                                                                                                                                                                        |
| 移动端 / 200% Zoom / 键盘 | 人工验收                        | **NOT_RUN**         | 需要真实人工执行                                                                                                                                                                                                                    |

没有把 `LOCAL_VALIDATED` 记为 `ONLINE_ACCEPTED`，也没有把自动 a11y 结果记为
人工屏幕阅读器验收。

## 9. 下一阶段建议

1. 合并 UI 的 PR-A / PR-B。
2. Core 侧完成 `0.2.0-rc.0` 版本 commit 并跑完整 `release:precheck --channel rc`；
   其中 `check:latest-tags` 需要先关闭 RC-07 的 13 个 prerelease `latest`。
3. 打 `v0.2.0-rc.0`，随后 UI 对齐 pin 并提交配对记录。
4. 在隔离环境完成 tarball 安装 + create-zeus 六模板 + Verdaccio 发布演练后，
   再进入受保护的在线验收与人工审批。
