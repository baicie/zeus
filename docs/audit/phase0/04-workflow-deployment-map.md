# 工作流、部署与证据映射

- `zeus`：**17** 个工作流（`ls .github/workflows/*.yml`）
- `zeus-ui`：**9** 个工作流
- 合计 26 个

## 1. 生产部署全景（设计包的重大缺口）

设计包称 `admin-image.yml` 是「当前唯一生产镜像部署」。实测有 **3 个工作流、4 个生产镜像、4 个公网站点**。

| #   | 工作流                       | 仓库        | environment    | 部署对象                         | 公网入口                                                   | 镜像                                 |
| --- | ---------------------------- | ----------- | -------------- | -------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| 1   | `admin-image.yml:480`        | zeus        | `production`   | Admin 容器                       | `admin.moonbyte.top:8443`                                  | `ghcr.io/<owner>/zeus-admin`         |
| 2   | `playground-image.yml:231`   | zeus        | `production`   | Playground 容器（80/81 双端口）  | `playground.moonbyte.top:8443` + `panel.moonbyte.top:8443` | `ghcr.io/<owner>/zeus-playground`    |
| 3   | `ai-workbench-image.yml:448` | **zeus-ui** | `production`   | AI Workbench + AI Host（两容器） | `ai.moonbyte.top:8443`                                     | `zeus-ai-workbench` + `zeus-ai-host` |
| 4   | `docs.yml:59-61`             | zeus-ui     | `github-pages` | 组件文档站                       | `<owner>.github.io/zeus-ui/`                               | —                                    |
| 5   | `demos-pages.yml:319`        | zeus        | `demos-pages`  | Admin demo + AI demo（静态）     | `<owner>.github.io/zeus-demos/`                            | —                                    |
| 6   | `playground-pages.yml`       | zeus        | 无             | Playground 静态站                | `<owner>.github.io/zeus-playground/`                       | —                                    |
| 7   | `docs.yml:27-29`             | zeus        | `github-pages` | 框架文档站                       | `<owner>.github.io/zeus/`                                  | —                                    |

**四产品拓扑**（`deploy/host-validation/production.layout.json:12-34`、`compose.yml`）：

| 产品            | 容器                |       容器端口 | 宿主 loopback | Caddy 上游        | 生产域名                                          |
| --------------- | ------------------- | -------------: | ------------- | ----------------- | ------------------------------------------------- |
| playground host | `zeus-playground`   |             80 | 18080         | `127.0.0.1:18080` | playground.moonbyte.top:8443                      |
| sandbox         | 同容器              |             81 | 18081         | `127.0.0.1:18081` | panel.moonbyte.top:8443/zeus-sandbox/sandbox.html |
| admin           | `zeus-admin`        |           8080 | 18090         | `127.0.0.1:18090` | admin.moonbyte.top:8443                           |
| ai-workbench    | `zeus-ai-workbench` |             80 | 18091         | `127.0.0.1:18091` | ai.moonbyte.top:8443                              |
| ai-host         | `zeus-ai-host`      | 8788（expose） | —             | 经 workbench 反代 | 不直接暴露                                        |

---

## 2. `zeus` — 17 个工作流

| #   | 文件（行数）                        | 触发                                             | 服务对象                                   | 产物                                                                           | environment / secrets                                                 | 迁移归属                                  |
| --- | ----------------------------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------- |
| 1   | `admin-image.yml`（793）            | push main + paths；PR + paths；dispatch `deploy` | **admin 应用 + 生产部署**                  | GHCR/TCR 镜像；体积摘要（**无 artifact**）                                     | `production`；TCR 双密钥 + `ZEUS_PLAYGROUND_DEPLOY_*`                 | **ecosystem**                             |
| 2   | `playground-image.yml`（462）       | push main + paths；PR；dispatch                  | **playground 应用 + 生产部署**             | GHCR + TCR 镜像；**无 artifact**                                               | `production`；TCR + `ZEUS_PLAYGROUND_DEPLOY_*`                        | **investigate**（随 Playground 归属）     |
| 3   | `playground-pages.yml`（157）       | push main + paths；dispatch                      | Playground 静态站                          | artifact `playground-pages-site`；推 `zeus-playground`                         | `PLAYGROUND_PAGES_TOKEN`                                              | **investigate**                           |
| 4   | `demos-pages.yml`（376）            | push main + paths；dispatch `ui-ref`/`publish`   | **admin demo + zeus-ui ai-workbench demo** | `demos-pages-site`（7d）、`demos-pages-pairing`（30d）；推 `zeus-demos`        | `demos-pages`；`DEMOS_PAGES_TOKEN`                                    | **ecosystem / 双轨**                      |
| 5   | `host-deployment-prepare.yml`（83） | dispatch only                                    | 四产品镜像构建 + 本地预演                  | `host-deployment-stage1`（含 `oci/*.tar`）                                     | 无 environment/secrets                                                | **ecosystem**                             |
| 6   | `host-deployment-stage2.yml`（225） | dispatch only                                    | 四产品生产事务部署                         | `host-deployment-stage2-evidence`（30d）                                       | `${{ inputs.environment }}`；自托管 runner `[self-hosted, zeus-host]` | **ecosystem**                             |
| 7   | `product-acceptance.yml`（348）     | dispatch；push `feat/release-*`                  | 四产品 Linux/Windows 真实验收              | `product-acceptance-{linux,windows}`、`product-images-linux`                   | 无（硬编码本地口令）                                                  | **ecosystem / 双轨**                      |
| 8   | `ci.yml`（1160）                    | push main；PR 任意基；dispatch                   | **framework 主 CI + 发布证据**             | 12 类 artifact（见 §4）                                                        | 仅 `GITHUB_TOKEN`                                                     | **zeus**（`create-zeus-candidates` 双轨） |
| 9   | `compiler-native.yml`（141）        | `workflow_call`；PR + paths；push main；dispatch | 7 平台原生编译器                           | `compiler-native-<target>`                                                     | 无                                                                    | **zeus**                                  |
| 10  | `release.yml`（390）                | push tag `v*`                                    | npm 发布链路                               | `ui-pairing`、`release-authorization`、`create-zeus-candidate-release` 等 5 个 | `Release`                                                             | **zeus**                                  |
| 11  | `release-canary.yml`（345）         | push main；dispatch `dry-run/publish`            | canary 通道 + 下游 dispatch                | `canary-readiness`、`canary-packed-consumers`                                  | `Canary`；`ZEUS_UI_DISPATCH_TOKEN`                                    | **zeus**                                  |
| 12  | `devtools-release.yml`（87）        | push tag `create-zeus@*`、`vite-plugin@*`        | 独立版本线发布                             | `create-zeus-registry-report`                                                  | `Release`                                                             | **zeus**                                  |
| 13  | `repair-dist-tags.yml`（68）        | dispatch                                         | dist-tag 修复                              | `latest-tag-repair`                                                            | `Release`                                                             | **zeus**                                  |
| 14  | `repair-native-latest.yml`（70）    | dispatch + 确认串                                | native latest 清理                         | `native-latest-cleanup-report`                                                 | `Release`                                                             | **zeus**                                  |
| 15  | `docs.yml`（60）                    | push main + `docs/**`；dispatch                  | 框架文档站                                 | Pages artifact                                                                 | `github-pages`                                                        | **zeus**                                  |
| 16  | `component-host-bench.yml`（152）   | PR/push main + paths                             | 框架性能基线                               | `component-host-benchmark`（90d）                                              | 无                                                                    | **zeus**                                  |
| 17  | `component-host-rc.yml`（121）      | PR + paths                                       | RC 快速门禁                                | `component-host-rc-report`                                                     | 无                                                                    | **zeus**                                  |

### 2.1 跨仓 checkout `zeus-ui` 的 5 处

| 工作流                               | 行号                      | 方式                                                                         | 影响                                 |
| ------------------------------------ | ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| `ci.yml`（`create-zeus-candidates`） | 952-958                   | `actions/checkout` repo `baicie/zeus-ui`，ref `vars.ZEUS_UI_REF \|\| 'main'` | 跨仓构建 create-zeus 候选            |
| `demos-pages.yml`                    | 98-107                    | **匿名 HTTPS clone** + `fetch --depth 1`                                     | **依赖 zeus-ui 公开**                |
| `host-deployment-prepare.yml`        | 38-43                     | `actions/checkout` + input `ui-ref`                                          | 四产品预演                           |
| `product-acceptance.yml`             | 35-39 / 141-145 / 243-247 | `actions/checkout` ×3 job                                                    | 5 条验收命令里 3 条在 zeus-ui 内执行 |
| `release.yml`                        | 128-136                   | `actions/checkout` @ pairing 记录的 SHA                                      | 发布配对                             |

### 2.2 不是 checkout 但仍是跨仓依赖

| 工作流                 | 行号    | 依赖形态                                                                                           |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `admin-image.yml`      | 131-150 | `gh api repos/<owner>/zeus-ui/commits/main` 解析 SHA 注入 build-arg                                |
| `playground-image.yml` | 115-136 | 同上                                                                                               |
| `release-canary.yml`   | 336-345 | `POST repos/baicie/zeus-ui/dispatches`（需 `ZEUS_UI_DISPATCH_TOKEN`）                              |
| `demos-pages.yml`      | 211-214 | 在 `zeus-ui` 目录内执行 `scripts/release/ai-demo-recording.ts`（该脚本在 zeus-ui 仓库，不在 zeus） |

### 2.3 `demos-pages.yml` — 最复杂的跨仓耦合

它是唯一**同时构建两仓 demo 并发布到一个站点**的工作流：

1. 解析 `zeus` 与 `zeus-ui` 的 40 位 SHA **各一次**，后续全部用记录值（`:116-128`）
2. 从 `zeus-ui/examples/ai-workbench/package.json` 读 `@zeus-js/*` 的 pin，再在 `zeus` 仓里
   `git rev-parse refs/tags/v<ver>` 反查对应 commit（`:137-145`）——**找不到就直接失败**
3. 在 zeus 侧构建 admin demo（`ZEUS_ADMIN_DEMO=1`，base `/zeus-demos/admin/`）
4. 在 zeus-ui 侧构建 AI demo（`ZEUS_AI_DEMO=1`，base `/zeus-demos/ai/`）
5. 生成 `demo-pairing.json`（schema `zeus.demo-pairing/v1`，含 `coreCommit`/`uiCommit`/`aiRuntime`/`products[].artifactDigest`/`siteDigest`）
6. 发布前 `--verify --reproducible` 重算并逐字段比对
7. force-push 到 `zeus-demos` 仓库

**唯一 secret 是 `DEMOS_PAGES_TOKEN`**（推 Pages 仓库用）。zeus-ui 侧靠公开匿名克隆，不需要 token。

**迁移含义**：这个工作流**无法留在任一侧**。它要么整体迁 ecosystem，要么在 zeus 保留但接受
「zeus 持续跨仓构建 zeus-ui demo」这一事实——后者与设计包的目标冲突。

---

## 3. `zeus-ui` — 9 个工作流

| #   | 文件（行数）                    | 触发                                                                  | 服务对象                                            | 产物                                                      | environment / secrets                                | 迁移归属                    |
| --- | ------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| 1   | `ci.yml`（60）                  | push 全分支（跳过 `release:` 提交）；PR                               | zeus-ui 本体门禁（编排 test/showcase/ai-workbench） | 无                                                        | 无                                                   | **zeus-ui**                 |
| 2   | `test.yml`（226）               | `workflow_call`                                                       | 组件包 + data-grid + AI 包                          | `data-grid-benchmark-<run_id>`、`data-grid-framework-e2e` | 无                                                   | **zeus-ui**                 |
| 3   | `showcase.yml`（175）           | `workflow_call` + dispatch                                            | 4 个 showcase                                       | `showcase-unit-artifacts`、`showcase-e2e-artifacts`       | 无                                                   | **zeus-ui**                 |
| 4   | `docs.yml`（97）                | PR；push main + paths                                                 | **组件文档站 + Pages 部署**                         | Pages artifact → `deploy-pages`                           | `github-pages`；`pages:write` + `id-token:write`     | **zeus-ui**                 |
| 5   | `ai-workbench.yml`（405）       | `workflow_call` + dispatch（`live`）                                  | **ai-workbench 应用**（P0/BYOK/CSP/visual/live）    | 5 类 artifact                                             | `ai-workbench-live`；4 个 live secrets               | **ecosystem**               |
| 6   | `ai-workbench-image.yml`（758） | push main + paths；PR；dispatch `deploy`                              | **ai-workbench + ai-host 生产部署**                 | GHCR/TCR 两镜像；体积摘要（**无 artifact**）              | `production`；TCR 双密钥 + `ZEUS_WORKBENCH_DEPLOY_*` | **ecosystem**               |
| 7   | `publish.yml`（221）            | `workflow_call` + dispatch                                            | 46 个 `@zeus-web/*` 发布                            | `ui-release-pairing`、`ui-publish-preflight`              | `Release`；`NPM_PUBLISH_TOKEN`                       | **zeus-ui**（跨仓发布契约） |
| 8   | `release.yml`（298）            | dispatch only                                                         | 发布编排（打 tag + 派发 publish）                   | `ui-release-pairing-release`                              | 无 environment；`contents:write`                     | **zeus-ui**（跨仓发布契约） |
| 9   | `zeus-canary-compat.yml`（241） | `repository_dispatch: zeus-canary-published`；dispatch；**每日 cron** | 上游兼容                                            | **无 artifact**                                           | 无                                                   | **zeus-ui**                 |

### 3.1 `ai-workbench-image.yml` 的三段（与 admin-image 同构）

`build`（63-216）→ `mirror-tcr`（218-430）→ `deploy`（432-758）：

- 两镜像同批构建：`examples/ai-host/Dockerfile`、`examples/ai-workbench/Dockerfile`
- 解析 Core SHA：`gh api repos/<owner>/zeus/commits/main`（103-119）注入 build-arg
- **体积预算**：`AI_HOST_IMAGE_MAX_MB` / `AI_WORKBENCH_IMAGE_MAX_MB`，默认 160MB，**只写 step summary**
- **`provenance: false`**（`:153,178`）——镜像无 SLSA provenance
- 部署：TCR@digest → TCR:tag → GHCR 镜像站 → ghcr.io；revision label 校验；健康检查 `127.0.0.1:8083/healthz`；
  最后校验公网 `build-info.json` 的 `uiCommit == GITHUB_SHA`

### 3.2 zeus-ui 的发布配对（跨仓契约）

```
release.yml（dispatch）
  validate-context      版本↔dist-tag 频道规则（:49-67）
  release               check-release-pairing --online（:170-199，读 Core 的 tag 与记录）
                        → 写 outputs coreCommit/pairing_mode
                        → 创建 tag v$VERSION（:208-229）
  dispatch-publish       复验 Core tag 指向 coreCommit（:255-280）
                        → gh workflow run publish.yml --ref v$VERSION

publish.yml
  强制 core_commit 为 40 位 SHA、pairing_mode == 'online'（:85-96）
  → checkout release_sha → build → verify:pack → pairing --online（:143-154）
  → preflight → capture latest → ci-publish → verify:published
```

**配对以 Core 为锚，单向依赖**：`zeus-ui/release-pairing/README.md:3` 明写该目录已退役，
权威记录在 Core 的 `release-pairing/v<version>.json`（现为 `meta/release/pairing/v<version>.json`）。

**发现一处契约矛盾**（UNKNOWN 待澄清）：`release-pairing/README.md:67-68` 说 beta 频道可跳过 online 检查，
但 `publish.yml:93-96` 与 `release.yml:188-191` 对任意版本都强制 `online`。
当前版本恰为 `-beta.35`。这是迁移前必须搞清的前置问题。

---

## 4. `ci.yml` 的 13 个 job（zeus）

| job                       | 行        | 服务什么                                                                                                                                                        |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `impact`                  | 50-155    | 路径影响分类，输出 job 开关                                                                                                                                     |
| `lint-and-check`          | 157-285   | audit、secret scan、`check:sbom:write`、actionlint、lint/format/type、structure、package-versions                                                               |
| `rust-compiler`           | 287-346   | Rust fmt/clippy/test、native+wasm、compiler parity、bench                                                                                                       |
| `build`                   | 348-443   | `pnpm build` + `size:report:ci` + `build-size-report` artifact                                                                                                  |
| `test`                    | 445-467   | `pnpm test-unit`、`check:devtools-gc`                                                                                                                           |
| `packed-consumers`        | 487-657   | **发布证据核心**：`check:packed-consumers`、golden、`check:sbom:write`、create-zeus、rc-readiness、UI provenance、**`check:admin`（:641-642）**、hmr、hydration |
| `browser-web-components`  | 666-726   | 6 个三引擎 WC 门禁                                                                                                                                              |
| `browser-runtime`         | 744-864   | 12 个 DOM/hydration/HMR 门禁                                                                                                                                    |
| `browser-playground`      | 866-934   | 5 个 playground 门禁                                                                                                                                            |
| `create-zeus-candidates`  | 936-1013  | **跨仓 checkout zeus-ui** + 模板安装验证                                                                                                                        |
| `cross-platform-evidence` | 1015-1070 | 跨平台发布证据                                                                                                                                                  |
| `docs-build`              | 1072-1090 | 仅构建，不发布                                                                                                                                                  |
| `ci-gate`                 | 1092-1160 | 唯一分支保护检查                                                                                                                                                |

**`check:admin` 的确切位置**：`packed-consumers` job 的 `Admin navigation in Chromium, Firefox and WebKit` 步骤（`ci.yml:641-642`）。

---

## 5. 沙箱 origin 的三套并存方案（迁移必须收敛）

| 方案      | 位置                                                     | 形态                                                                                                  |
| --------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| A. 路径式 | `deploy/host-validation/production.layout.json:11`       | 同一域名下的 `/zeus-sandbox/sandbox.html`                                                             |
| B. 子域式 | `deploy/host-validation/nginx.conf:44`                   | `sandbox.studio.example.com`，`CSP sandbox allow-scripts; frame-ancestors https://studio.example.com` |
| C. 端口式 | `examples/playground-editor/deploy/nginx.conf:38`        | 容器 81 端口，`frame-ancestors https://playground.moonbyte.top:8443`                                  |
| D. 同源式 | `playground-pages.yml` + `VITE_ZEUS_SANDBOX_SAME_ORIGIN` | Pages 单站点，靠 iframe `sandbox="allow-scripts"`（无 `allow-same-origin`）强制 opaque origin         |

运行时统一 fail-closed：`examples/playground-editor/src/sandbox.ts:34` `globalThis.origin === 'null'`，
否则拒绝运行。这是好设计——**方案可以并存，安全边界只有一条**。但拆仓时必须在 ecosystem 里
统一成一套，否则四套部署各配一套 CSP。

---

## 6. 工作流归属汇总

| 归属               | 数量 | 工作流                                                                                                                                                                                                      |
| ------------------ | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **zeus**           |   12 | ci、compiler-native、release、release-canary、devtools-release、repair-dist-tags、repair-native-latest、docs、component-host-bench、component-host-rc + ~~admin-image~~、~~playground-image~~（后两个见下） |
| **zeus-ui**        |    5 | ci、test、showcase、docs、publish、release、zeus-canary-compat（7 个，其中 publish/release 属跨仓契约）                                                                                                     |
| **zeus-ecosystem** |    7 | admin-image、host-deployment-prepare、host-deployment-stage2、product-acceptance、demos-pages、ai-workbench、ai-workbench-image                                                                             |
| **investigate**    |    3 | playground-image、playground-pages（随 Playground 归属）；ci 的 `create-zeus-candidates`（双轨）                                                                                                            |

> 上表 zeus 一行的计数与列表不一致（列表含 12 个但其中两个已划归 ecosystem）。
> 以列表为准：zeus 实际保留 **10 个**。

## 7. UNKNOWN

- `check:playground-api` 是否在 CI 中执行（workflow grep 无命中）
- `check-playground-performance` 是否被任何 workflow 调用（仅本地 `measure:` 脚本）
- `playground-online-acceptance.ts`（1028 行）未被任何 workflow 调用
- `deployment-acceptance.ts` / `playground-online-acceptance.ts` 的 npm 入口与 CI job 绑定
- beta 频道与强制 `online` 配对的契约矛盾（§3.2）
- `netlify.toml` 的 Netlify 站点是否仍处于激活状态（配置本身已失效）
