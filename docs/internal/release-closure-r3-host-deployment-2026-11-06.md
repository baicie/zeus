# Zeus 0.2.0 Release Closure R3 — Main CI Recovery & Host Validation Readiness

日期：2026-11-06

## A. Git 基线

| 仓库    | main                                       | 工作区                                 | 说明                    |
| ------- | ------------------------------------------ | -------------------------------------- | ----------------------- |
| Zeus    | `a1036a0f25c671b6b0890f72ae2f5b8d6c61d90c` | 主 checkout 保留用户 `Cargo.toml` 修改 | R3 从独立 worktree 开始 |
| Zeus UI | `294431194a50735b62ba38e674fac1af76ae6cfb` | clean                                  | PR #122 squash 合并     |

本轮没有修改用户 `Cargo.toml`，没有合并/发布/部署/打 Tag。

## B. Canary 修复结果

- 原故障：run `42080709060`（`a1036a0`）中 macOS Intel
  `x86_64-apple-darwin` 的 Rust 1.95.0 安装失败：
  `static.rust-lang.org` DNS `failed to lookup address information`。
- 其他 6 个 native 目标成功；`canary-dry-run` 因依赖失败被 SKIPPED。
- 处置：先用 `gh run rerun --failed` 重跑原生 Job，未修改源码；macOS Intel
  重跑成功，7/7 native 目标通过，`canary-dry-run` 随后实际执行（非 SKIPPED）。
- 最终：run `42080709060` SUCCESS；`canary-readiness` artifact
  `READY_FOR_CANARY_PUBLISH`，sourceCommit `a1036a0`，version
  `0.1.1-canary.20261106.242.2.a1036a0f`，10 项 checks 全 pass。
- 发布/下游 job 仍按预期 SKIPPED；`CANARY_PUBLISH = NOT_RUN`。

| 门禁             | 状态    | 证据                                      |
| ---------------- | ------- | ----------------------------------------- |
| `MAIN_CI`        | PASS    | main CI @ `a1036a0`                       |
| `NATIVE_MATRIX`  | PASS    | 7/7 @ `a1036a0`                           |
| `CANARY_DRY_RUN` | PASS    | `42080709060`，`READY_FOR_CANARY_PUBLISH` |
| `CANARY_PUBLISH` | NOT_RUN | 未授权、无 npm 凭据                       |

## C. 四产品部署准备

统一模板：`deploy/host-validation/`（compose、nginx、env、README）。

- WebC Studio / Native Lab：双源静态镜像；host 8080，sandbox 8081；不同 Origin；
  CORS/CSP；容器只读、tmpfs、资源上限。
- Admin：Node + SQLite；仅本机绑定，生产经 TLS ingress；上传/会话安全限制。
- AI Host：仅内部网络，不发布端口；workbench 同源代理 `/ai-host/`；SSE 不缓冲。
- AI Workbench：静态 nginx；依赖 AI Host。
- Stage 1 入口：`pnpm deploy:stage1 --core-root ... --ui-root ...`。

Stage 1 已从干净的 Core `a1036a0` / UI `2944311` worktree 构建镜像并运行完成：

| 产品                        | image                      | imageDigest                                                               | build-info artifactDigest                                                 |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Playground（WebC + Native） | `zeus-playground:stage1`   | `sha256:25b5bb6b9c2d4e2eafeecf679a013608f851995105ddfbe7c4ad716056f4a4f0` | `sha256:89a04c0e87984350dabe6a6bf1675f1caf7f4edd436a318498afa174c068f303` |
| Admin                       | `zeus-admin:stage1`        | `sha256:fa9f7976e3936ac7c573d30943c83f50fec5280f3ed9c7dd03d8a78ed3c8490a` | `sha256:884267ac7a2f8878924ba1756e895d68c6314692729ffb75e9741dc2062b3534` |
| AI Host                     | `zeus-ai-host:stage1`      | `sha256:c29d3c7b217356c08bb88814d2750935e9bc0247991e99deff5ff8681ff1e595` | —（服务镜像）                                                             |
| AI Workbench                | `zeus-ai-workbench:stage1` | `sha256:a816712a89455a704de0e26040b2ef71f0b38421b3479cf3bd9eb6d660edf2ad` | `sha256:022cb11cf48c2d623db4f21ff8fb4ec67fe240bf9cdb34abe957191cf1445328` |

结果：`LOCAL_VALIDATED`，四产品均通过；Compose 四服务健康检查通过后执行
浏览器验收并清理容器。证据目录：`temp/deploy/stage1/`。

## D. Evidence Chain

`Source SHA → CI Run → Artifact Digest → Container Image Digest → Compose → Local Acceptance`

- Stage 1 的 `deployment-candidate.json` 记录 Core/UI SHA、每个 image 的本地
  content digest、build-info `artifactDigest`。
- 不使用 PR Head SHA 冒充 main Merge SHA；本轮的 Core 证据从 `a1036a0` 的干净
  worktree 构建，UI 从 `2944311` 构建。旧报告中的 `6665ee4` / `a291682` 是历史
  PR Head 证据：`6665ee4` 的代码经 merge commit `458be30` 进入 main，之后
  `a1036a0` 只增加文档；UI `a291682` 之后 `0768a72` 只修改 build-info 脚本注释，
  再 squash 为 `2944311`。Stage 1 已重新构建 main 产物，没有替换 SHA。
- 线上部署时复用 `provenance.json` / `image-provenance.json`，并用
  `check:deployment-acceptance --mode online` 比对实际 `/build-info.json`。
- Provenance 是 digest 绑定，不是签名 attestation；签名升级仍是后续项。

## E. Security Findings

详见 `docs/deployment/host-security-review.md`。本轮无 P0；P1 为 AI Host
仅 Origin allowlist、provenance 非签名、浏览器 DNS 固定仅 Chromium、Admin
密码必须来自 Secret。容器资源限制与只读文件系统已补入模板。

## F. Manual Acceptance Kit

详见 `docs/deployment/manual-a11y-acceptance.md`。覆盖 VoiceOver/Safari、
NVDA/Chrome/Firefox、键盘、Dialog 焦点、表单错误、Data Grid、Shadow DOM、
AI 流式消息、200% Zoom、移动端、高对比度与 Reduce Motion。
当前全部 `NOT_RUN`，不得自动标记 PASS。

## G. 外部输入

- 域名/DNS。
- TLS 证书或 ACME 方案。
- 部署环境、主机与权限（Stage 2 需要 self-hosted `zeus-host` runner）。
- 隔离验收账号与租户。
- A11y 验收人员。
- 发布审批人。
- npm 发布授权（当前 `npm whoami` 为 `ENEEDAUTH`）。

## H. 最终状态

`READY_FOR_HOST_DEPLOYMENT_AUTHORIZATION`

- Main `a1036a0`：CI、Native Matrix 7/7、Docs、Release Canary dry-run 全部 PASS；
  `CANARY_PUBLISH` 仍为 `NOT_RUN`。
- 四产品在 main SHA 上完成镜像构建、Compose 启动、健康检查与浏览器验收，
  全部 `LOCAL_VALIDATED`。
- 安全审查无 P0；P1 残余风险已记录（AI Host 需 ingress 鉴权、provenance 非签名、
  Chromium 之外的 DNS pinning、Admin Secret 注入）。
- 人工 A11y、公网 HTTPS、部署审批、npm 发布仍 `NOT_RUN`。

该状态不等于 `ONLINE_ACCEPTED`，也不等于 `READY_FOR_RELEASE`。

## I. 可重复证据命令

```bash
# Core main
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test-unit
pnpm check:packed-consumers
pnpm check:create-zeus
pnpm check:create-zeus-packed
pnpm check:rc-readiness
pnpm release:canary --dry-run-only

# UI main
pnpm check
pnpm test-e2e:ai
pnpm check:ai-workbench
pnpm data-grid:framework-e2e
pnpm release:joint-readiness

# Deployment Stage 1 / online gate
pnpm deploy:stage1 --core-root <clean-core-main> --ui-root <clean-ui-main>
ZEUS_ACCEPTANCE_ADMIN_EMAIL=... ZEUS_ACCEPTANCE_ADMIN_PASSWORD=... \
ZEUS_ACCEPTANCE_AI_REPLAY=true ZEUS_ACCEPTANCE_TENANT=... \
  pnpm check:deployment-acceptance --mode online \
    --manifest temp/release/deployment.json \
    --provenance temp/release/provenance.json \
    --write-mode isolated --tenant ...
```
