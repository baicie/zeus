# Zeus 0.2.0 Release Closure R1 — Canary / RC 门禁分离

日期：2026-11-05

## A. 审查基线

- Core：`origin/main` = `1fd54b132ff4fbb533ac91093cce0718e2e53082`（PR #187 已合并）。
- Core 修复分支：`fix/020-canary-rc-gate-separation`，从上述 `origin/main` 的独立
  worktree `temp/worktrees/020-canary-rc-gate-separation` 创建。
- 本轮代码提交：`68e638f`（门禁分离）、`a7175b1`（release workflow 浏览器安装）。
- UI：`origin/main` = `526512b5329b8da3910ecb0ae133a3c95a3887b8`；本轮只读审查，未修改。
- 运行环境：Node `24.16.0`（与 `.node-version` 一致）。
- 用户主 checkout 的 `Cargo.toml` 调试改动未被读取、覆盖、暂存或提交。

## B. 根因归因

| #   | 现象                                                         | 类型                              | 证据与结论                                                                                                                                                                               |
| --- | ------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Canary 在 `check:rc-readiness` 失败                          | 确认的实现缺陷                    | `release-canary.ts` 调用共享 `release:precheck --strict`；`release.config.ts` 的命令表包含 `check:rc-readiness`。Canary 误用了 RC 的检查表。                                             |
| 2   | `clean-worktree` 失败                                        | 确认的实现缺陷                    | Canary 先执行版本改写、lockfile 更新与 native loader 同步，再运行 readiness；`check:rc-readiness` 把任何未提交改动都判为失败，没有“允许的发布改写”概念。                                 |
| 3   | `packed-consumers` 报告缺失                                  | 确认的实现缺陷 + 缺失证据         | Canary precheck 从未运行 `check:packed-consumers`，而 `check:rc-readiness` 读取 `temp/packed-consumers/report.json`。报告应在 canary/RC precheck 内、readiness 之前生成，并绑定源 HEAD。 |
| 4   | `cross-platform`、`release-approval`、`online-products` 失败 | 合理的正式发布阻断，不属于 Canary | 这些是 RC/Stable 的验收条件。Canary 只验证主分支包可发布性，不应要求四个线上产品、人工 A11y 或正式审批。                                                                                 |
| 5   | `--strict` 没有让 Canary 变成另一套门禁                      | 确认的实现缺陷                    | 外部 `@baicie/release` 的 `runPrecheck` 只顺序执行 `precheck.commands`；`--strict` 只影响可选的 `verifyCommand`，本项目没有配置它，因此 `--strict` 实际是 no-op。                        |
| 6   | `main` Push 会直接触发真实 npm Canary                        | 确认的发布风险                    | `release-canary.yml` 的 `push` 与 `workflow_dispatch` 都会进入真实发布 job；没有 workflow 级 dry-run 路径。合并修复 PR 本身也会触发该 job。                                              |
| 7   | 版本改写后本地工作区被污染                                   | 确认的实现缺陷                    | `release:canary` 直接在当前 checkout 执行版本改写、`pnpm install --lockfile-only`，失败或 dry-run 后没有恢复机制。                                                                       |
| 8   | 正式 RC precheck 也缺少 packed-consumer 报告                 | 潜在的通道兼容缺陷                | `release.config.ts` 的 RC 命令表没有 `check:packed-consumers`，但 `check:rc-readiness` 要求该报告。Stable Release 在没有外部预生成报告时会失败。                                         |
| 9   | Native 矩阵失败                                              | 未发生                            | 本轮 CI 已确认 Core Native Matrix 通过；本地 canary 预演也通过了 `check:native-binaries`（使用从主 checkout 复制的 7 平台二进制）。                                                      |
| 10  | 四个线上产品、跨平台、人工 A11y、审批缺失                    | 合理的发布证据缺口                | 本地 E2E 与三引擎证据不能替代线上部署、真实 Windows/Linux 运行和 VoiceOver/NVDA 人工验收。                                                                                               |

## C. 变更

### 显式发布通道

- 新增 `scripts/release/release-channels.ts`：
  - `ReleaseChannel = 'canary' | 'rc'`。
  - `CANARY_PRECHECK_COMMANDS` 只保留代码质量、Rust/native、包元数据、npm pack、独立消费者、
    Secrets/SBOM、API/types 和 Canary readiness。
  - RC 仍使用 `release.config.ts` 的完整命令表，并在 `check:rc-readiness` 前生成 packed
    consumer 报告。
- `scripts/release/release-precheck.ts` 改为仓库内顺序执行器：
  - `pnpm release:precheck` 默认 `rc`；
  - `pnpm release:precheck --channel canary` 使用 Canary 表；
  - 不再接受 `--strict`（旧 flag 没有真实语义）。

### Canary readiness

新增 `scripts/check/canary-readiness.ts`（`zeus.canary-readiness/v1`）：

- 校验完整源 SHA 与当前 HEAD 一致；
- 校验 canary 版本与根包版本一致；
- 只允许 release 改写路径：固定包 `package.json`、`pnpm-lock.yaml`、native loader、
  `.changeset/`、`CHANGELOG.md`；任何源码路径改动为 `fail`；
- 校验 host native binary、packed consumer 报告、create-zeus 报告及其 `sourceCommit`、
  Secrets、SBOM、lockfile 一致性；
- 不要求线上产品、跨平台、人工 A11y 或发布审批。

### 版本改写隔离

新增 `scripts/release/release-rewrite-guard.ts`：

- 版本改写前要求源工作树干净，并记录源 HEAD；
- 版本改写、lockfile 更新、native loader 同步都在 `try/finally` 中执行；
- dry-run 或失败后恢复本进程产生的临时改写文件，不覆盖快照前已存在的用户改动；
- `ZEUS_SOURCE_COMMIT` 传给 precheck，所有报告绑定真实源 HEAD。

### Workflow

- `release-canary.yml`：
  - `push` 只运行 `canary-dry-run`（`pnpm release:canary --dry-run-only`），不调用 npm
    publish、dist-tag、promotion 或下游 dispatch。
  - 真实发布只允许 `workflow_dispatch` 且 `mode=publish`，仍使用 `Canary` environment。
  - 真实 Canary job 和 dry-run job 都安装 Playwright 浏览器，供 packed-consumer 检查使用。
- `release.yml`：正式 Release precheck 前安装 Playwright 浏览器，因为 RC precheck 现在
  生成 packed-consumer 证据。

### 测试与文档

- `scripts/check/__tests__/canary-readiness.spec.ts`
- `scripts/release/__tests__/release-channels.spec.ts`
- `scripts/release/__tests__/release-rewrite-guard.spec.ts`
- `scripts/release/__tests__/release-canary-gates.spec.ts`
- `scripts/release/__tests__/release-config.spec.ts`（RC 命令表新增 packed consumers）
- `docs/release-process.md` 增加 Canary 通道说明。

### 行为变化与兼容风险

1. **合并本 PR 不再触发真实 npm Canary**：push 只跑 dry-run；真实发布需要维护者手动
   `workflow_dispatch` + `mode=publish` + `Canary` environment。这是发布授权变更，
   需要维护者明确批准后才能合入。
2. Stable Release precheck 增加 `check:packed-consumers`，并要求 Playwright 浏览器；
   运行时间增加，但补上了 RC readiness 的缺失证据。
3. `release:precheck --strict` 被移除；内部调用方改用默认 RC 或 `--channel canary`。
4. 外部 `@baicie/release` 仍负责版本改写与发布；本轮只替换了项目内的 precheck 执行器，
   没有修改外部框架。

## D. 验证结果

| 命令                                                                                                                                           | 结果              | 证据                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run scripts/release/__tests__ scripts/check/__tests__/canary-readiness.spec.ts scripts/check/__tests__/rc-readiness.spec.ts` | PASS              | 18 files / 140 tests                                                                                                                                                                                                                                              |
| `pnpm check`                                                                                                                                   | PASS              | Node 24.16                                                                                                                                                                                                                                                        |
| `pnpm lint`                                                                                                                                    | PASS              | Node 24.16                                                                                                                                                                                                                                                        |
| `pnpm format-check`                                                                                                                            | PASS              | Node 24.16                                                                                                                                                                                                                                                        |
| `pnpm check:packed-consumers`                                                                                                                  | PASS              | Native / React 18 / React 19 / Vue 3；Chromium/Firefox/WebKit                                                                                                                                                                                                     |
| `pnpm check:create-zeus`                                                                                                                       | PASS              | 六模板                                                                                                                                                                                                                                                            |
| `pnpm check:canary-readiness`                                                                                                                  | PASS              | HEAD `a7175b1`，`READY_FOR_CANARY_PUBLISH`，报告 `temp/release/canary-readiness.json`                                                                                                                                                                             |
| `pnpm check:package-versions`                                                                                                                  | PASS              | 所有 fixed 包与根包版本一致（`0.1.1-beta.20`）                                                                                                                                                                                                                    |
| `pnpm check:exports`                                                                                                                           | PASS              | 包导出边界                                                                                                                                                                                                                                                        |
| `pnpm check:repository`                                                                                                                        | PASS              | 包 repository 元数据                                                                                                                                                                                                                                              |
| `pnpm release:canary --dry-run-only`                                                                                                           | BLOCKED           | 在 `test-unit` 停止：`packages/web-c/output-wc/__tests__/public-declarations.spec.ts` 既有 30s 硬超时，本机实际约 43.7s；此前 audit/secrets/SBOM/native/build/runtime-interop/cjs/build-dts/release-artifacts/api/check/lint 均通过；guard 恢复 31 个版本改写文件 |
| `pnpm check:create-zeus-packed`                                                                                                                | NOT_RUN / BLOCKED | 本地 packed basic-app Vite build 长时间未完成，未取得可信结果；不能在报告中写成 PASS                                                                                                                                                                              |
| npm `publish --dry-run`                                                                                                                        | NOT_RUN           | 未到达该阶段；本轮未执行任何真实发布                                                                                                                                                                                                                              |
| `check:native-binaries`                                                                                                                        | PASS              | 本地使用 7 平台二进制；CI Native Matrix 已 PASS                                                                                                                                                                                                                   |

## E. 发布状态

| 项                     | 状态                                                 |
| ---------------------- | ---------------------------------------------------- |
| `CORE_INTEGRATION`     | PASS — `1fd54b1` 已合并；修复分支待审                |
| `UI_INTEGRATION`       | PASS — `526512b` 已合并                              |
| `CANARY_DRY_RUN`       | BLOCKED — 本地 30s 测试硬超时，未完成全链路          |
| `CANARY_REAL_PUBLISH`  | NOT_RUN — 手动 `mode=publish` 保留，未执行           |
| `JOINT_RC_READINESS`   | NOT_READY — 线上 URL、Win/Linux、人工 A11y、审批缺失 |
| `FOUR_ONLINE_PRODUCTS` | NOT_RUN                                              |
| `MANUAL_A11Y`          | NOT_RUN                                              |
| `RELEASE_APPROVAL`     | NOT_RUN                                              |

## F. 双仓联合预检（只读）

- Core `origin/main` `1fd54b1`；UI `origin/main` `526512b`。
- UI `release:joint-readiness` 使用 `zeus-ui.joint-readiness/v1`，要求四个产品在线 URL、
  Win/Linux、VoiceOver/NVDA、联合审批，并读取 Core 的 Admin/Playground 报告；它不读取
  Core 的 `canary-readiness`。
- Core 的 RC precheck 不读取 UI 报告，因此不存在 Core→UI→Core 的循环等待；正式联合发布
  仍是“Core 先形成 RC 证据，UI joint readiness 再读取”的单向依赖。
- AI Headless V2：PR-32 Reference Host 已完成；PR-33 Workbench 部分完成，真实 Live
  Provider 和在线部署未授权/未执行。AI Reference Host 是受控参考宿主，不等于开放生产级
  任意代码执行。
- Native 编译器矩阵已 PASS；正式平台产品验收仍 NOT_RUN。本地 E2E 已 PASS；四个产品线上
  部署仍 NOT_RUN。

## G. 下一步（Release Closure R2）

1. 在 CI/Node 24 环境重跑 `release:canary --dry-run-only`；若仍命中 30s 硬超时，单独修复
   该重型类型测试的超时策略（不与发布门禁混在一起）。
2. 部署 WebC Studio、Native Lab、Admin、AI Workbench，记录 HTTPS URL 与 commit 关联。
3. 在真实 Linux/Windows runner 上执行产品与浏览器验收。
4. 执行 VoiceOver/NVDA 人工验收。
5. 两仓版本对齐到 0.2.0 RC，生成证据；经人工批准后再创建 tag、发布 npm、部署。

### R2 DSH 提示词草案

> 接手 Zeus 0.2.0 Release Closure R2。基于 Core `main` 与 UI `main` 的最新 HEAD，先运行
> `release:canary --dry-run-only` 与 UI `release:joint-readiness`，确认 Canary dry-run
> 全绿；随后完成四产品 HTTPS 部署、Linux/Windows 实际运行验收、VoiceOver/NVDA 人工验收，
> 并把两仓版本对齐到 0.2.0 RC。所有证据必须绑定完整 commit；不得伪造 PASS，不得在未获
> 人工批准前创建 tag、发布 npm 或执行正式部署。输出可审计的发布准备报告与下一步授权清单。

## 最终裁决

`BLOCKED_BY_ENVIRONMENT`

代码修复与单元/集成验证已完成，Draft PR 可进入人工审查；但完整 Canary dry-run 被本机
既有 30 秒测试硬超时阻断，`CANARY_DRY_RUN` 不能标记为 PASS。CI/Node 24 环境应作为下一次
真实 dry-run 的执行环境。
