# Zeus 0.2.0 Release Closure R2 — 四产品部署准备与跨平台验收

日期：2026-11-05

## A. 双仓状态

| 仓库    | main（基线）                               | R2 分支                                    | 工作区                         | PR                                                          |
| ------- | ------------------------------------------ | ------------------------------------------ | ------------------------------ | ----------------------------------------------------------- |
| Zeus    | `ea255e4e372babd27107ffeb898675ea5d4d0d94` | `b1eb4a164a1aedcf6b61d4f82d56636673472f1e` | `temp/worktrees/020-canary...` | [#189](https://github.com/baicie/zeus/pull/189)（Draft）    |
| Zeus UI | `526512b5329b8da3910ecb0ae133a3c95a3887b8` | `330186dd8a8779198efb8d38e435278763287d09` | `temp/worktrees/r2-four...`    | [#121](https://github.com/baicie/zeus-ui/pull/121)（Draft） |

- 用户主 checkout 的 `Cargo.toml` 调试改动未被读取、覆盖、暂存或提交。
- 基线 Canary dry-run：[42021802342](https://github.com/baicie/zeus/actions/runs/42021802342)
  在 `ea255e4` 上 SUCCESS；真实 `release-canary`、npm smoke、downstream dispatch 均 SKIPPED。
- R2 未执行 npm publish、dist-tag、Tag、生产部署或 GitHub Environment/Secrets 修改。
- 本报告是 `b1eb4a1` / `330186d` 之后唯一的新增文档；产品代码与该证据 commit 一致。

## B. 四产品矩阵

| 产品         | 本地构建 | 浏览器 E2E | Docker | HTTPS   | 部署证据        |
| ------------ | -------- | ---------- | ------ | ------- | --------------- |
| WebC Studio  | PASS     | PASS       | PASS   | NOT_RUN | LOCAL_VALIDATED |
| Native Lab   | PASS     | PASS       | PASS   | NOT_RUN | LOCAL_VALIDATED |
| Zeus Admin   | PASS     | PASS       | PASS   | NOT_RUN | LOCAL_VALIDATED |
| AI Workbench | PASS     | PASS       | PASS   | NOT_RUN | LOCAL_VALIDATED |

- 浏览器 E2E：
  - `pnpm check:playground-editor`：三引擎 + 导出工程安装/typecheck/build；
  - `pnpm check:admin`：三引擎 + DevTools；
  - `pnpm check:ai-workbench`：三引擎，聊天、SSE、审批、工作区写入、附件、多会话隔离、Diff、Test Report。
- Docker 真实镜像：`zeus-playground:r2`、`zeus-admin:r2`、`zeus-ai-host:r2`、
  `zeus-ai-workbench:r2` 均构建成功；启动四个容器后由
  `check:deployment-acceptance --mode local` 验收，全部 `LOCAL_VALIDATED`
  （`temp/release/deployment-acceptance.container.json`），包括 Admin 登录、
  sandbox CSP、AI nginx `/ai-host/` 代理与 SSE。
- `HTTPS` 与线上部署未执行（无部署授权/域名），因此没有 `ONLINE_PASS` 或
  `ONLINE_ACCEPTED`；`LOCAL_VALIDATED` 不等于线上通过。

## C. 跨平台矩阵

| 平台    | 来源                                        | 结果                                               |
| ------- | ------------------------------------------- | -------------------------------------------------- |
| macOS   | 本轮真实执行                                | PASS（三产品门禁 + 四产品本地预演 + 四个容器）     |
| Linux   | `product-acceptance.yml` 运行 `42043657021` | PASS（三产品门禁 + 四产品预演，`LOCAL_VALIDATED`） |
| Windows | `product-acceptance.yml` 运行 `42043657021` | PASS（三产品门禁 + 四产品预演，`LOCAL_VALIDATED`） |

证据绑定：Core `b1eb4a1`，UI `330186d`。两个 job 的 artifact 中
`deployment-acceptance.local.json` 均为 `LOCAL_VALIDATED`，四个产品全部通过。
Native Compiler Matrix 的 7/7 只证明二进制可构建，本表是产品运行验收。

## D. 发布证据

| 证据                           | 状态            | 说明                                                                    |
| ------------------------------ | --------------- | ----------------------------------------------------------------------- |
| Canary dry-run                 | PASS            | `42021802342`，`ea255e4`                                                |
| Core RC readiness              | NOT_READY       | 缺线上 URL、人工 A11y、发布审批；本地与跨平台产品证据已通过             |
| UI joint readiness             | NOT_READY       | 缺线上 URL、人工 A11y、联合审批与 DataGrid framework 报告；本地证据通过 |
| Packed consumers / Create Zeus | PASS（CI 历史） | R1 Canary dry-run 覆盖；本轮未重复本地全量运行                          |
| Four online products           | NOT_RUN         | 无部署授权；本地/容器 `LOCAL_VALIDATED`                                 |
| Manual A11y                    | NOT_RUN         | VoiceOver/NVDA 必须人工完成                                             |
| Release approval               | NOT_RUN         | 必须由发布负责人给出                                                    |

UI `release:joint-readiness` 当前输出（Core `b1eb4a1` / UI `330186d`）的 blocker：
`clean-worktrees`（本报告未提交时的快照）、`data-grid-framework` 报告缺失、
`manual-a11y`、`cross-platform` 人工标记、`release-approval`、四个在线 URL。
四个产品的本地证据均已是 pass。

## E. 代码变更

### 部署验收与本地预演

- `scripts/release/deployment-acceptance.ts`：
  - manifest 绑定 Core/UI commit，AI Workbench 必须绑定 UI commit；
  - 线上模式只接受 HTTPS，拒绝 loopback/私网主机与 HTTPS→HTTP 重定向；
  - 校验 HSTS、nosniff、sandbox CSP，执行 Admin 登录、HttpOnly Cookie 检查与
    AI Workbench 消息发送；
  - `--browsers` 执行所有指定引擎，不再静默忽略。
- `scripts/release/local-deployment-rehearsal.ts`：构建生产产物，启动
  host/sandbox 双源、Admin、AI Host/Workbench，输出 `LOCAL_VALIDATED`；
  Windows 入口守卫使用 `pathToFileURL`。
- `scripts/check/rc-readiness.ts`：`zeus.rc-evidence/v2`，40 位 `uiCommit`，
  Core 产品绑定 Core commit，AI Workbench 绑定 UI commit。

### 容器与跨平台修复

- Admin：Rust 构建阶段 + `crates`/Cargo、`corepack enable pnpm`、`build-dts`、
  `ZEUS_ADMIN_HOST=0.0.0.0`。
- Playground：Rust/WASM/native 构建、双源 nginx、CORS/安全头、独立 packed 导出。
- AI Host：先构建 workspace 包，`ZEUS_AI_HOST=0.0.0.0`。
- AI Workbench：nginx 同源 `/ai-host/` 代理，SSE 不缓冲。
- `.dockerignore` 将构建上下文从约 1.4 GB 降到约 1 MB。
- Playground 导出工程使用 `--ignore-workspace` 与本地 packed tarball 独立安装，
  Native Lab 导出声明 `@zeus-js/query`/`@zeus-js/router`。
- Windows：`pathToFileURL` 守卫、pnpm `shell`、`PLAYGROUND_BROWSERS`、
  UI 自己的 Playwright 版本。

### CI

- `.github/workflows/product-acceptance.yml`：Linux/Windows 真实 runner，
  Node 24、冻结安装、WASM/native 构建、`build-dts`、三产品浏览器门禁、
  四产品本地预演、artifact 上传；push 到 `r2/**` 时自动配对同名 UI 分支。

### 测试

- `deployment-acceptance.spec.ts`（5）、`rc-readiness.spec.ts`（8）、
  release/readiness 套件 150+；`tsc`、ESLint、Prettier 均 PASS。

## F. 评审发现与残余风险

独立评审工作流确认 14 项（去重后约 10 项真实缺陷），本轮已修复：
Windows 入口守卫、干净环境 native 构建、HTTPS 重定向降级、多引擎忽略、
Playground WASM 资产、导出工程独立安装与依赖、CI Playwright 版本、
容器 127.0.0.1 绑定。

仍未解决（R3）：

1. 部署验收不能证明线上产物与 manifest commit 的构建对应关系；建议产品输出
   `build-info.json` 或 ingress 注入 commit 头。
2. `uiCommit` 仍由证据文件自填（已要求完整 SHA）；应由 UI CI 生成 attestation。
3. 线上 HTTPS、VoiceOver/NVDA、发布审批未执行。
4. DataGrid framework 报告未在本轮生成，UI joint readiness 仍会报告缺失。

## G. CI 结果

- 最终运行：[42043657021](https://github.com/baicie/zeus/actions/runs/42043657021)
  - Linux product acceptance：SUCCESS
  - Windows product acceptance：SUCCESS
  - 两个 artifact 的 `deployment-acceptance.local.json` 均为
    `LOCAL_VALIDATED`（Core `b1eb4a1`，UI `330186d`）。
- 历史失败已修复：缺 d.ts、缺 native binding、导出工程未独立安装、
  导出依赖缺失、UI Playwright 版本不匹配。

## H. 最终裁决

`READY_FOR_HOST_VALIDATION`

所有本轮可执行检查已完成：四产品本地构建、三引擎浏览器门禁、四个真实容器、
Linux/Windows 真实 runner 的产品运行与四产品部署预演均通过。剩余工作必须在
获得部署授权后进行：四个产品 HTTPS 部署并运行
`check:deployment-acceptance --mode online` 取得 `ONLINE_ACCEPTED`，完成
VoiceOver/NVDA 人工验收，最后生成 RC 证据并取得发布审批。

本轮不授权、也未执行正式发布或生产部署。
