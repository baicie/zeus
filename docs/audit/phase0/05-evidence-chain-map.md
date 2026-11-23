# 证据链清单与缺口

设计包 `docs/04-ci-deployment-evidence.md:59-71` 要求每个生产应用至少保留 9 类证据。
本文件逐项核对**证据是否真的存在、存在哪里、能否跨 run 审计**。

## 1. 证据链总表

| 证据类型                  | 产出脚本                                                             | 产物路径                                                                                                                            | 上传方式                                                  | 关联 workflow                               | 归属             | 可跨 run 审计？                      |
| ------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- | ---------------- | ------------------------------------ |
| **SBOM（zeus）**          | `scripts/check/check-sbom.ts`（594 行，CycloneDX 1.5）               | `temp/sbom/zeus.cdx.json`（已提交）                                                                                                 | **不上传 artifact**                                       | ci（`check:sbom:write`）、release           | zeus             | **否**（仅同 run 内消费）            |
| **SBOM（zeus-ui）**       | **不存在**                                                           | —                                                                                                                                   | —                                                         | —                                           | —                | —                                    |
| 构建体积报告              | `scripts/size/build-size-report-cli.ts`                              | `temp/size/`（含 `size-report.md`）                                                                                                 | ✅ `build-size-report`（30d）                             | ci                                          | zeus             | ✅                                   |
| **镜像体积（admin）**     | `scripts/release/dist/image-size-gate.mjs`                           | `/tmp/size-summary.md` → `$GITHUB_STEP_SUMMARY`                                                                                     | ❌ **无 artifact**                                        | admin-image                                 | ecosystem        | **否**                               |
| **镜像体积（workbench）** | 内联（`ai-workbench-image.yml:186-216`）                             | `$GITHUB_STEP_SUMMARY` 表格                                                                                                         | ❌ **无 artifact**                                        | ai-workbench-image                          | ecosystem        | **否**                               |
| 部署预演（stage1）        | `scripts/release/deployment-stage1.ts`                               | `temp/deploy/stage1/{deployment-candidate,deployment.local,provenance,pair,deployment-acceptance.local}.json` + `oci/*.tar`         | ✅ `host-deployment-stage1`（7d）                         | host-deployment-prepare                     | ecosystem        | ✅                                   |
| 本地部署验收              | `scripts/release/local-deployment-rehearsal.ts`                      | `temp/release/deployment.local.json`、`deployment-acceptance.local.json`                                                            | ✅ 并入 `product-acceptance-*`                            | product-acceptance                          | ecosystem        | ✅                                   |
| 部署验收（在线）          | `scripts/release/deployment-acceptance.ts`（1365 行）                | `temp/release/deployment-acceptance.json`、`$STATE_DIR/acceptance/deployment.json`                                                  | ✅ `host-deployment-stage2-evidence`（30d）               | host-deployment-stage2                      | ecosystem        | ✅                                   |
| 部署事务与回滚            | `scripts/release/deployment-stage2.ts` + `deployment-transaction.ts` | `deployment-transaction.json`、`stage2-local-acceptance.json`                                                                       | ✅ 同上                                                   | host-deployment-stage2                      | ecosystem        | ✅                                   |
| 证据来源                  | stage2 内联 `cat >`                                                  | `evidence-source.json`（schema `zeus.deployment-evidence-source/v1`）                                                               | ✅ 同上                                                   | host-deployment-stage2                      | ecosystem        | ✅                                   |
| Demo 配对                 | `scripts/release/demo-pairing.ts`（schema `zeus.demo-pairing/v1`）   | `<site>/demo-pairing.json`                                                                                                          | ✅ `demos-pages-pairing`（30d）、`demos-pages-site`（7d） | demos-pages                                 | ecosystem / 双轨 | ✅                                   |
| 产物 provenance           | `scripts/release/write-provenance.ts`                                | `temp/release/provenance.json`                                                                                                      | ✅ 并入 product-acceptance                                | product-acceptance、host-deployment-prepare | ecosystem        | ✅                                   |
| 镜像 provenance           | product-acceptance `images` job 内联                                 | `temp/release/image-provenance.json`（schema `zeus.image-provenance/v1`）                                                           | ✅ `product-images-linux`                                 | product-acceptance                          | ecosystem        | ✅                                   |
| 跨平台发布证据            | `scripts/release/collect-cross-platform-evidence.ts`                 | `temp/cross-platform/evidence.json`                                                                                                 | ✅ `cross-platform-evidence`                              | ci                                          | zeus             | ✅                                   |
| 发布授权                  | `scripts/release/authorize-release.ts`（`--require-sbom`）           | `temp/release/release-authorization.json`、`tarballs.json`                                                                          | ✅ `release-authorization`                                | release                                     | zeus             | ✅                                   |
| Core/UI 配对              | `scripts/check/check-ui-pairing.ts`                                  | `temp/release/ui-pairing.json`                                                                                                      | ✅ `ui-pairing`                                           | release                                     | zeus             | ✅                                   |
| UI 发布配对               | `scripts/checks/release/check-release-pairing.ts`（866 行）          | `$RUNNER_TEMP/release-pairing.json`                                                                                                 | ✅ `ui-release-pairing`（`if-no-files-found: error`）     | publish                                     | zeus-ui          | ✅                                   |
| UI 发布预检               | `scripts/checks/release/check-publish-preflight.ts`                  | `publish-preflight.json`（schema `zeus-ui.publish-preflight/v1`）                                                                   | ✅ `ui-publish-preflight`                                 | publish                                     | zeus-ui          | ✅                                   |
| npm provenance            | `scripts/release.config.ts:20` `provenance: true`                    | registry 侧 sigstore                                                                                                                | —                                                         | publish、release                            | zeus-ui          | ✅（registry）                       |
| Canary readiness          | `scripts/release/release-canary.ts`                                  | `temp/release/canary-readiness.json`                                                                                                | ✅ `canary-readiness` / `-dry-run`                        | release-canary                              | zeus             | ✅                                   |
| latest dist-tag 策略      | `scripts/release/check-latest-tags.ts`                               | `temp/release/latest-tags.json`、`latest-policy.json`                                                                               | ✅ 2 个 artifact                                          | release                                     | zeus             | ✅                                   |
| RC 就绪报告               | `scripts/check/check-release-readiness.ts`                           | `temp/release/rc-readiness.json`                                                                                                    | ✅ `rc-readiness`                                         | ci                                          | zeus             | ✅                                   |
| packed consumer 报告      | `scripts/check/check-packed-consumers.ts` 等                         | `temp/packed-consumers`、`temp/golden-components`、`temp/admin`、`temp/hydration`                                                   | ✅ `packed-consumer-reports`                              | ci                                          | zeus             | ✅                                   |
| benchmark 历史            | `scripts/bench/component-host.ts`                                    | `temp/bench/component-host/{report.json,report.md,trend.json,trend.csv}`                                                            | ✅ `component-host-benchmark`（90d）                      | component-host-bench                        | zeus             | ✅                                   |
| 变更影响计划              | `scripts/ci/impact-analysis.ts`                                      | `temp/ci/impact.json`                                                                                                               | ✅ `impact-plan`（14d）                                   | ci                                          | zeus             | ✅                                   |
| DataGrid benchmark        | `packages/advanced/data-grid/benchmarks/*`                           | `.artifacts/data-grid-benchmark/{results.log,report.json,environment.txt}`                                                          | ✅ `data-grid-benchmark-<run_id>`                         | test                                        | zeus-ui          | ✅                                   |
| DataGrid framework E2E    | `vitest --project data-grid-framework-browser-e2e`                   | `temp/data-grid-framework-e2e/report.json`                                                                                          | ✅ `data-grid-framework-e2e`                              | test                                        | zeus-ui          | ✅                                   |
| AI workbench 各 gate      | `scripts/checks/ai/check-ai-workbench-*.ts`（8 个）                  | `temp/ai-workbench-{p0,byok,build,live,visual}`                                                                                     | ✅ 5 类 artifact（14-30d）                                | ai-workbench                                | ecosystem        | ✅                                   |
| showcase 单测/E2E         | `pnpm showcase:test` / `showcase:e2e`                                | `examples/showcase-unit/.artifacts`、`e2e/showcase/.artifacts`、`temp/component-mode-parity/report.json`、`temp/dialog-interaction` | ✅ 2 个 artifact（7d）                                    | showcase                                    | zeus-ui          | ✅                                   |
| bundle size               | `scripts/checks/build/check-bundle-size.ts`（56 行）                 | 无文件（pass/fail）                                                                                                                 | —                                                         | ci（`ci.yml:53`）                           | zeus-ui          | ❌（只有红绿）                       |
| ui-tarball baseline       | `scripts/checks/build/check-ui-tarball-baseline.ts`（303 行）        | `temp/ui-tarball-baseline.json`                                                                                                     | ❌ **9 个工作流均未调用**                                 | —                                           | zeus-ui          | ❌（本地证据）                       |
| AI pack 报告              | `scripts/checks/ai/check-ai-pack.ts`                                 | `temp/ai-pack-report.json`                                                                                                          | ❌ 未上传                                                 | test、ai-workbench（生成）                  | zeus-ui          | ❌（被 `joint-readiness.ts:361` 读） |
| Playground 在线验收       | `scripts/release/playground-online-acceptance.ts`（1028 行）         | 运行时校验                                                                                                                          | ❌ **未被任何 workflow 调用**                             | —                                           | investigate      | ❌                                   |

---

## 2. 六个必须修的缺口

设计包 `docs/04-ci-deployment-evidence.md:59-70` 要求 9 类证据，逐项核对后的缺口：

### 缺口 1 — SBOM 从不作为 artifact 上传（高）

- `check-sbom.ts` 产出 `temp/sbom/zeus.cdx.json`，被 `release.yml:184-187` 的 `--require-sbom` 消费
- **但从未 `upload-artifact`**：跨 run 无法复核「v0.2.0-rc.3 这个版本的 SBOM 长什么样」
- zeus-ui **完全不产 SBOM**，镜像 `provenance: false`

**影响**：设计包要求「SBOM 随实际应用迁移」，但当前 zeus 的 SBOM 只覆盖框架包，不覆盖 admin 镜像；
ecosystem 需要从零建立镜像级 SBOM。

### 缺口 2 — 三个镜像的体积证据只有 step summary（高）

| 镜像                | 体积门禁                                                         | 默认预算 | 证据形式     |
| ------------------- | ---------------------------------------------------------------- | -------: | ------------ |
| `zeus-admin`        | `image-size-gate.mjs --budget-mb ${ADMIN_IMAGE_MAX_MB \|\| 120}` |   120 MB | step summary |
| `zeus-ai-workbench` | 内联                                                             |   160 MB | step summary |
| `zeus-ai-host`      | 内联                                                             |   160 MB | step summary |
| `zeus-playground`   | **无体积门禁**                                                   |        — | —            |

step summary 会在 run 过期后消失（默认 90 天），且不可下载比对。设计包要求「image size / size budget 结果」
作为证据保留——当前不满足。

### 缺口 3 — `playground-image.yml` 没有 revision label 校验（中）

对比 `admin-image.yml:693-700` 会校验容器 OCI revision label == `github.sha`；
`playground-image.yml` 只有 HTTP 200 健康检查（`:448-454`）。这意味着**无法证明跑的是本次构建的镜像**。

### 缺口 4 — 三个入口脚本不在 CI 中（中）

| 脚本                                                     | 行数 | 状态                                                                   |
| -------------------------------------------------------- | ---: | ---------------------------------------------------------------------- |
| `scripts/release/playground-online-acceptance.ts`        | 1028 | 未被任何 workflow 调用（`accept:playground-online` 只在根 scripts 里） |
| `scripts/playground/check-playground-performance.ts`     |  322 | 只有本地 `measure:` 入口                                               |
| `scripts/playground/generate-api-completions.ts --check` |  316 | workflow grep 无命中                                                   |

设计包要求「环境不可用时必须明确标记 `BLOCKED_ENV`，不得用配置文件存在冒充真实部署验收」。
现状是**有验收脚本但没接进 CI**——比「假装验收」好，但意味着这些能力在合并前不会执行。

### 缺口 5 — zeus-ui 的 tarball baseline 与 pack 报告不上传（低）

- `check-ui-tarball-baseline.ts`（303 行）产 `temp/ui-tarball-baseline.json`，9 个工作流均未调用
- `temp/ai-pack-report.json` 由 `test.yml` 生成但不上传，只被 `joint-readiness.ts:361` 同 run 消费

### 缺口 6 — beta 频道与强制 online 配对的契约矛盾（高，阻断发布）

`zeus-ui/release-pairing/README.md:67-68` 声称 beta 可跳过 online 半段；
`publish.yml:93-96` 与 `release.yml:188-191` 对任意版本都强制 `pairing_mode == 'online'`。
当前版本 `-beta.35`。**beta 发布究竟是走 online 还是不走，必须先确认**，否则迁移后第一件事就是发布失败。

---

## 3. 证据可追溯性矩阵

设计包要求「证据可关联源 commit、lockfile、image digest 和 workflow run」。逐产品核对：

| 产品         | 源 commit                                          | lockfile                   | image digest                             | workflow run        | 缺口                                 |
| ------------ | -------------------------------------------------- | -------------------------- | ---------------------------------------- | ------------------- | ------------------------------------ |
| admin        | ✅ `ZEUS_CORE_COMMIT` + `ZEUS_UI_COMMIT` build-arg | ✅ `pnpm-lock.yaml` 进镜像 | ✅ `crane` 回读 + revision label         | ✅ step summary     | 体积证据不可下载                     |
| playground   | ⚠️ `--ui-commit` 传的是 Core SHA（`:97`）          | ✅                         | ⚠️ 无 revision label 校验                | ✅                  | 两个缺口                             |
| ai-workbench | ✅ `ZEUS_CORE_COMMIT` + `ZEUS_UI_COMMIT`           | ✅                         | ✅ revision label + 公网 build-info 反证 | ✅                  | 体积证据不可下载；`provenance:false` |
| docs         | —                                                  | —                          | —                                        | ✅ Pages deployment | 静态站，无需 digest                  |

**`build-info.json` 是这套体系里最可靠的锚**：三个产品都在运行时暴露 `coreCommit`/`uiCommit`，
部署后从公网拉取反证。这是设计包要求的「证据链」中做得最好的部分。

---

## 4. 迁移时必须新建的证据能力

| 能力                              | 现状                                                          | ecosystem 新建成本                              |
| --------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| 镜像级 SBOM（CycloneDX/Syft）     | 无                                                            | 中（可复用 `check-sbom.ts` 的 schema 校验逻辑） |
| 镜像体积 artifact                 | step summary                                                  | 低（加 `upload-artifact`）                      |
| `provenance: true` 镜像构建       | admin/playground 未设；workbench 显式 `false`                 | 低（改 build-push-action 参数）                 |
| Playground 的 revision label 校验 | 无                                                            | 低（复用 admin 的做法）                         |
| 应用级测试覆盖率报告              | 无（只有 `test-coverage` 本地脚本）                           | 中                                              |
| 部署回滚演练记录                  | 有脚本（`deployment-transaction.ts`）无 artifact 化的演练历史 | 中                                              |

---

## 5. UNKNOWN

- 线上实际运行的镜像 digest 与仓库中最后一次 workflow run 是否一致（未访问 Actions 历史）
- `ADMIN_IMAGE_MAX_MB` 等 vars 的当前实际值（仓库中读不到，只能在 GitHub 设置里）
- `deploy/host-validation/compose.yml` 是否曾被真实使用（README 称「deployment candidate, not a public deployment」）
- zeus-ui 的 `temp/` 86 个目录中哪些是活跃证据、哪些是历史残留
