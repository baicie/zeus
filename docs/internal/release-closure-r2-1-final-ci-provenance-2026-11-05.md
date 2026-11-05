# Zeus 0.2.0 Release Closure R2.1 — Final CI, Provenance & Host Validation Prep

日期：2026-11-05

## A. 最终 HEAD 与 PR

| 仓库    | 分支                                  | HEAD                                       | PR                                                          | 状态                    |
| ------- | ------------------------------------- | ------------------------------------------ | ----------------------------------------------------------- | ----------------------- |
| Zeus    | `feat/release-four-product-readiness` | `6b45d9f56fafa482a197ae41f37cd1844a6af880` | [#190](https://github.com/baicie/zeus/pull/190)（Draft）    | 替代 #189，原 PR 已关闭 |
| Zeus UI | `feat/release-four-product-readiness` | `2634f1d55c85ceb50309f2f9d615bad571661c32` | [#122](https://github.com/baicie/zeus-ui/pull/122)（Draft） | 替代 #121，原 PR 已关闭 |

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

| 检查                                   | 状态                                | 证据                                       |
| -------------------------------------- | ----------------------------------- | ------------------------------------------ |
| Core Typecheck / ESLint / Format       | 待最终运行                          | `CI` workflow                              |
| Rust Compiler / Native Matrix          | 待最终运行                          | `compiler-native.yml`                      |
| Packed Consumers / Create Zeus Packed  | 待最终运行                          | Canary / CI                                |
| Canary Dry-run                         | 历史 PASS `ea255e4`；新 HEAD 待运行 | `release-canary.yml`                       |
| Deployment Acceptance 单测             | PASS（25 tests）                    | 本地                                       |
| Linux Product Acceptance               | 待最终运行                          | `product-acceptance.yml`                   |
| Windows Product Acceptance             | 待最终运行                          | 同上                                       |
| Linux Image Digests（provenance）      | 待最终运行                          | 同上                                       |
| UI Unit / Typecheck                    | PASS（本地）                        | pre-commit                                 |
| AI Headless Browser / AI Workbench     | PASS（三引擎，`2634f1d`）           | `temp/ai-workbench/report.json`            |
| DataGrid Framework Browser             | PASS（三引擎，`2634f1d`）           | `temp/data-grid-framework-e2e/report.json` |
| UI Build / Pack / Joint Readiness 预检 | PASS / NOT_READY（仅人工与线上项）  | `temp/release/joint-readiness.json`        |

## D. 四产品矩阵

| 产品         | Build | Browser | Docker | Local Acceptance | Online Acceptance | Provenance                   |
| ------------ | ----- | ------- | ------ | ---------------- | ----------------- | ---------------------------- |
| WebC Studio  | PASS  | PASS    | PASS   | LOCAL_VALIDATED  | NOT_RUN           | build-info + artifact digest |
| Native Lab   | PASS  | PASS    | PASS   | LOCAL_VALIDATED  | NOT_RUN           | build-info + artifact digest |
| Zeus Admin   | PASS  | PASS    | PASS   | LOCAL_VALIDATED  | NOT_RUN           | build-info + artifact digest |
| AI Workbench | PASS  | PASS    | PASS   | LOCAL_VALIDATED  | NOT_RUN           | build-info + artifact digest |

本地验收在 Core `6b45d9f` / UI `2634f1d` 上执行；容器镜像在 R2 阶段构建并
验证，R2.1 增加 build-info/OCI 标签。

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
