# Zeus 0.2.0 Release Closure R2.1 — Final CI, Provenance & Host Validation Prep

日期：2026-11-05

## A. 最终 HEAD 与 PR

| 仓库    | 分支                                  | HEAD                                                   | PR                                                          | 状态                    |
| ------- | ------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | ----------------------- |
| Zeus    | `feat/release-four-product-readiness` | `6665ee4d0548d76bfaaf80b69d6c10c11e50d1d6`（最终证据） | [#190](https://github.com/baicie/zeus/pull/190)（Draft）    | 替代 #189，原 PR 已关闭 |
| Zeus UI | `feat/release-four-product-readiness` | `a291682f5db8e93f69a08a50500bd8c93d790d86`             | [#122](https://github.com/baicie/zeus-ui/pull/122)（Draft） | 替代 #121，原 PR 已关闭 |

- 原 PR #189/#121 因 `check:branch` 拒绝 `r2/four-product-readiness` 而无法继续；
  已保留历史并关闭，替代 Draft PR 引用原编号。
- main 基线未改动：Core `ea255e4`，UI `526512b`。
- 用户主 checkout 的 `Cargo.toml` 改动未被触碰。

## B. 已修复缺陷

| 级别 | 缺陷                                | 根因                                                | 修改                                                                 | 回归验证                           |
| ---- | ----------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | --------------------------------- |
| P0   | #189 `lint-and-check` 失败          | `r2/...` 不符合 `feat                               | fix                                                                  | .../<scope>-<topic>`               | 迁移到 `feat/release-four-product-readiness`，替代 PR | `pnpm check:branch` + CI lint job |
| P1   | 在线验收只信 manifest URL           | 缺少构建/部署产物绑定                               | `build-info.ts`、`write-provenance.ts`、`verifyDeployedBuildInfo`    | 13 个单元测试，含伪造 digest 反例  |
| P1   | SSRF/私网/重定向风险                | 只校验初始 URL；fetch 自动跟随                      | 手动重定向、逐跳 allowlist/协议/DNS、私有地址拒绝、Chromium DNS 固定 | `isPrivateAddress` 测试 + 代码审查 |
| P1   | 在线写入可能触碰生产数据            | Admin 登录/AI 发消息无隔离门禁                      | `--write-mode isolated --tenant`，否则 `BLOCKED`；AI 要求 Replay     | 本地预演 + 评审                    |
| P1   | `uiCommit` 自证                     | RC 证据文件可自填 UI SHA                            | 新增 CI generated `pair.json`；rc-readiness 要求 pair 匹配           | rc-readiness 9 tests               |
| P1   | DataGrid report 缺失                | 未运行/未上传                                       | 本地运行三引擎 + CI Linux job + artifact                             | `data-grid-framework-e2e` 3/3      |
| P1   | CI 干净环境失败                     | 缺 native、d.ts、UI Playwright、导出 workspace/依赖 | 构建 native/dts/WASM、安装 UI 浏览器、独立 packed 导出               | Linux/Windows 产品 job             |
| P2   | 容器绑定 127.0.0.1 / 构建上下文过大 | Dockerfile 默认值                                   | `0.0.0.0`、`.dockerignore`、build-info/labels                        | 四个镜像 + 容器验收                |

## C. CI 矩阵（最新 HEAD）

| 检查                                   | 状态                               | 证据                                                   |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| Core Typecheck / ESLint / Format       | PASS                               | `CI` run `42054429230`（`lint-and-check`）             |
| Rust Compiler / Native Matrix          | PASS                               | CI + Compiler Native Matrix（`8d65e33`）               |
| Packed Consumers / Create Zeus Packed  | PASS                               | CI `packed-consumers`；本地 packed `41ef8d0`           |
| Canary Dry-run                         | PASS                               | `42061604233`（`6665ee4`），`READY_FOR_CANARY_PUBLISH` |
| Deployment Acceptance 单测             | PASS（25 tests）                   | 本地                                                   |
| Linux Product Acceptance               | PASS                               | `42061541143`（`6665ee4` / UI `a291682`）              |
| Windows Product Acceptance             | PASS                               | `42061541143`（`6665ee4` / UI `a291682`）              |
| Linux Image Digests（provenance）      | PASS                               | `42054420685`；四个镜像 digest 已记录                  |
| UI Unit / Typecheck                    | PASS（本地）                       | pre-commit                                             |
| AI Headless Browser / AI Workbench     | PASS（三引擎，`a291682`）          | `temp/ai-workbench/report.json`                        |
| DataGrid Framework Browser             | PASS（三引擎，`a291682`）          | `temp/data-grid-framework-e2e/report.json`             |
| UI Build / Pack / Joint Readiness 预检 | PASS / NOT_READY（仅人工与线上项） | `temp/release/joint-readiness.json`                    |

## D. 四产品矩阵

| 产品         | Build | Browser | Docker | Local Acceptance | Online Acceptance | Provenance                   |
| ------------ | ----- | ------- | ------ | ---------------- | ----------------- | ---------------------------- |
| WebC Studio  | PASS  | PASS    | PASS   | LOCAL_VALIDATED  | NOT_RUN           | build-info + artifact digest |
| Native Lab   | PASS  | PASS    | PASS   | LOCAL_VALIDATED  | NOT_RUN           | build-info + artifact digest |
| Zeus Admin   | PASS  | PASS    | PASS   | LOCAL_VALIDATED  | NOT_RUN           | build-info + artifact digest |
| AI Workbench | PASS  | PASS    | PASS   | LOCAL_VALIDATED  | NOT_RUN           | build-info + artifact digest |

本地验收在 Core `6665ee4` / UI `a291682` 上执行；容器镜像由 CI 构建并记录
不可变 digest：

| 产品         | image digest                                                              | build-info artifact digest                                                |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| WebC Studio  | `sha256:647f8dcdf1f5965d6b8b644b52e3ac3b119fae2eff7da5c327c4a0510e782ab6` | `sha256:cf6f9a22d9a2de369683afb51f05b229ab82af94dbbd3cb2f8f54bb1802cfc4b` |
| Native Lab   | 同上（同一 playground 镜像）                                              | 同上                                                                      |
| Zeus Admin   | `sha256:8b2ba281315f71114afac94e4c70a2a75b310f27966b2bab8960fdbfd1811728` | `sha256:884267ac7a2f8878924ba1756e895d68c6314692729ffb75e9741dc2062b3534` |
| AI Workbench | `sha256:ad1264f054af427fcf736e6e3e6e92f32cf3726c292c8c1db8de702b871f80d4` | `sha256:022cb11cf48c2d623db4f21ff8fb4ec67fe240bf9cdb34abe957191cf1445328` |
| AI Host      | `sha256:91f7e0bfa40ddf783596e5b945c0c1c19b9323b9433b94d93f907beb252cb9f0` | —（服务镜像）                                                             |

Linux/Windows 的 dist 构建 digest 可能不同（平台构建差异）；线上 manifest
必须使用实际部署平台的 image build-info digest，而不是另一平台的 dist digest。

## E. 证据链

`Source Commit → CI checkout (pair.json) → Build → Artifact/Image Digest → Test → Deployable RC`

- `pair.json`：CI 实际 `git rev-parse HEAD` 的 Core/UI SHA + run id。
- `provenance.json`：每产品 build-info 的 `artifactDigest`、run id。
- `image-provenance.json`：镜像内容 digest、build-info、OCI revision 标签。
- 在线验收同时比对 manifest、provenance 和实际 `/build-info.json`；不一致
  直接 `FAIL`。

Provenance 是摘要绑定的 CI 记录，不是加密签名；签名 Attestation 仍为 R3。

## F. 剩余人工事项

- 域名与 HTTPS（四个公网地址仍为 `NOT_RUN`）。
- 公网部署授权。
- VoiceOver/NVDA、键盘、焦点、200% 缩放、移动端人工验收。
- 正式发布审批。
- npm 发布授权与 dist-tag。
- 线上隔离租户与测试数据清理。

## G. R3 提示词（可直接执行）

> 接手 Zeus 0.2.0 Release Closure R3。基于 Core `feat/release-four-product-readiness`
> 与 UI 同名分支的最新 HEAD，确认 `product-acceptance.yml` 的 Linux/Windows/
> images job 与 `pair.json`、`provenance.json`、`image-provenance.json` 全部通过。
> 获得维护者的公网部署授权后，按 `docs/deployment/host-validation.md` 部署四个产品
> 的 TLS 域名，使用 CI 的不可变 image digest，配置隔离测试租户与数据清理。
> 运行 `check:deployment-acceptance --mode online --write-mode isolated --tenant ...`
> 取得 `ONLINE_ACCEPTED`；完成 VoiceOver/NVDA 人工验收；生成 RC 证据并取得发布审批。
> 不得伪造线上结果、人工 A11y 或审批；不得在未授权前发布 npm/Tag。

## H. 最终裁决

`READY_FOR_R2_MERGE_REVIEW`

Canary Dry-run 已在 `6665ee4` 上通过（run `42061604233`），
`canary-readiness` 为 `READY_FOR_CANARY_PUBLISH`，真实 publish 与下游
dispatch 均按预期跳过。`6665ee4` 的 CI（lint/build/test/docs/packed/rust）、
Compiler Native Matrix、Linux/Windows 产品验收（run `42061541143`）与四个
镜像 provenance 全部通过，产品验收与 DataGrid 报告均绑定
`6665ee4` / UI `a291682`。

本裁决仅授权维护者审查是否合并 PR #190/#122，不授权实际合并、部署、打 Tag
或 npm 发布。线上 HTTPS、人工 A11y 与发布审批仍为 `NOT_RUN`。
