# 工作流、部署与证据迁移计划

Phase 1 要求「workflow / deployment / evidence 迁移映射」。本文件在 Phase 0 的 26 个工作流基础上给出归属与迁移动作。

机器可读版本见 `02-migration-matrix.csv`。

---

## 1. 归属总表

| 归属                         | 数量 | 工作流                                                                                                                                                                                                 |
| ---------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **zeus 保留**                |   11 | ci、compiler-native、release、release-canary、devtools-release、repair-dist-tags、repair-native-latest、docs、component-host-bench、component-host-rc、playground-image（+ playground-pages，待 D-02） |
| **zeus-ui 保留**             |    5 | ci、test、showcase、docs、zeus-canary-compat                                                                                                                                                           |
| **zeus-ui 保留（跨仓契约）** |    2 | publish、release                                                                                                                                                                                       |
| **zeus-ecosystem 新建**      |    5 | admin-image、ai-workbench、ai-workbench-image、host-deployment-prepare、host-deployment-stage2                                                                                                         |
| **zeus-ecosystem 或双轨**    |    2 | demos-pages、product-acceptance                                                                                                                                                                        |
| **待定（D-02）**             |    1 | playground-pages                                                                                                                                                                                       |

**合计 26**（11 + 5 + 2 + 5 + 2 + 1 = 26）。

---

## 2. 逐工作流的迁移动作

### 2.1 迁往 zeus-ecosystem（5 个）

| 工作流                        | 当前行数 | 迁移动作                                                                             | 前置条件                          |
| ----------------------------- | -------: | ------------------------------------------------------------------------------------ | --------------------------------- |
| `admin-image.yml`             |      793 | 整体复制到 ecosystem，路径改为 `apps/admin`；保留三段结构（build/mirror-tcr/deploy） | P1 + P2 + 新仓库 environment      |
| `ai-workbench.yml`            |      405 | 从 zeus-ui 复制，5 个 gate 一并迁                                                    | 4 个 live secrets 迁移            |
| `ai-workbench-image.yml`      |      758 | 从 zeus-ui 复制，两镜像路径改 `apps/ai-*`                                            | TCR 配置 + production environment |
| `host-deployment-prepare.yml` |       83 | 复制；**移除对 zeus-ui 的 checkout**（改为消费已发布包）                             | P1 + P2                           |
| `host-deployment-stage2.yml`  |      225 | 复制；自托管 runner `[self-hosted, zeus-host]` 归属需确认                            | runner 访问权限                   |

**关键改动**：`host-deployment-prepare.yml:38-43` 当前 checkout `baicie/zeus-ui`。
迁移后四产品都在 ecosystem 内，不再需要跨仓 checkout。这是本次重构**直接消除的一条反向依赖**。

### 2.2 双轨或迁 ecosystem（2 个）

| 工作流                   | 决策                 | 理由                                                                                                                        |
| ------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `demos-pages.yml`        | **整体迁 ecosystem** | 它同时构建 zeus 的 admin demo 与 zeus-ui 的 ai-workbench demo。迁移后两者都在 ecosystem，跨仓问题消失                       |
| `product-acceptance.yml` | **整体迁 ecosystem** | 5 条验收命令里 3 条在 zeus-ui 内执行（`:91-97`），四镜像里 2 个 Dockerfile 在 zeus-ui（`:284-289`）。迁移后全部在 ecosystem |

**收益**：`demos-pages.yml:98-107` 的「匿名 clone zeus-ui」与 `product-acceptance.yml:35-39` 的三处跨仓 checkout
都会消失。这是本次重构消除的**第 2、3、4 条反向依赖**。

**风险**：`demos-pages.yml:137-145` 会从 `zeus-ui/examples/ai-workbench/package.json` 读 `@zeus-js/*` pin，
再到 zeus 仓 `git rev-parse refs/tags/v<ver>`。迁移后这个跨仓校验要么删除，要么改为读 ecosystem 自己的 lockfile。
**建议删除**——它存在的意义正是「证明 demo 由哪个 Core commit 构建」，而迁移后这个信息来自 ecosystem 的 lockfile。

### 2.3 zeus 保留（11 个）

11 个工作流的迁移动作都是「不动」，但有两处需要修补：

| 工作流                 | 需要修补的点                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`               | `create-zeus-candidates`（`:936-1013`）checkout zeus-ui。**这是第 5 条反向依赖**，需在 Phase 7 决定：改为消费已发布 `@zeus-web/*`，或保留并登记例外 |
| `playground-image.yml` | 无 revision label 校验（Phase 0 R-16）；无体积门禁。建议在迁移期间顺手补上                                                                          |

### 2.4 zeus-ui 保留（7 个）

| 工作流                                              | 动作                                               |
| --------------------------------------------------- | -------------------------------------------------- |
| `ci.yml` / `test.yml` / `showcase.yml` / `docs.yml` | 不动                                               |
| `publish.yml` / `release.yml`                       | 不动，但需澄清 beta 与 `online` 配对的矛盾（R-13） |
| `zeus-canary-compat.yml`                            | 不动；它是 zeus-ui 主动验证上游 canary 的健康机制  |

**迁移后必须删除的引用**（因 ai-workbench 迁出）：

| 位置                   | 删除内容                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `ci.yml:26-29`         | `ai-workbench` job 编排                                     |
| `package.json:120-126` | 8 条 `check:ai-workbench*` / `check:ai-workbench-live` 脚本 |
| `vitest.config.ts:283` | `examples/ai-workbench/__tests__` 的 include                |
| `test.yml:208,224`     | AI story e2e（**保留**——它驱动 ai-showcase，留在 zeus-ui）  |

---

## 3. 部署拓扑的迁移

### 3.1 四个镜像

| 镜像                | 当前构建方                       | 迁移后                        | 切换阶段                     |
| ------------------- | -------------------------------- | ----------------------------- | ---------------------------- |
| `zeus-admin`        | `zeus/admin-image.yml`           | ecosystem `apps/admin`        | **Phase 6（最后）**          |
| `zeus-playground`   | `zeus/playground-image.yml`      | 留在 zeus（D-02）             | 不迁                         |
| `zeus-ai-workbench` | `zeus-ui/ai-workbench-image.yml` | ecosystem `apps/ai-workbench` | Phase 4                      |
| `zeus-ai-host`      | 同上                             | ecosystem `apps/ai-host`      | Phase 4（与 workbench 同批） |

### 3.2 六个站点

| 站点                           | 当前发布方                       | 迁移后               |
| ------------------------------ | -------------------------------- | -------------------- |
| `github.io/zeus/`              | zeus `docs.yml`                  | zeus                 |
| `github.io/zeus-ui/`           | zeus-ui `docs.yml`               | zeus-ui              |
| `github.io/zeus-playground/`   | zeus `playground-pages.yml`      | zeus（D-02）         |
| `github.io/zeus-demos/`        | zeus `demos-pages.yml`           | ecosystem            |
| `admin.moonbyte.top:8443`      | zeus `admin-image.yml`           | ecosystem（Phase 6） |
| `ai.moonbyte.top:8443`         | zeus-ui `ai-workbench-image.yml` | ecosystem（Phase 4） |
| `playground.moonbyte.top:8443` | zeus `playground-image.yml`      | zeus（D-02）         |

### 3.3 宿主与 Secrets 归属

Phase 0 发现 `admin-image.yml:494-496,504-505` 在 admin 部署中使用 playground 的 host/user/SSH 作为 fallback。
**当前一台宿主跑两个产品。**

迁移后需要重新划分：

| Secret / Var                                    | 当前                                | 迁移后归属                      |
| ----------------------------------------------- | ----------------------------------- | ------------------------------- |
| `ZEUS_PLAYGROUND_DEPLOY_HOST/USER/PORT/SSH_KEY` | zeus repo                           | zeus（Playground 留 zeus）      |
| `ZEUS_ADMIN_DEPLOY_*`                           | zeus repo（fallback 到 playground） | **ecosystem**（新建独立的一组） |
| `TCR_USERNAME/PASSWORD`                         | 两仓各有一份                        | ecosystem 新建；zeus 保留自己的 |
| `TCR_IMAGE` / `TCR_IMAGE_PLAYGROUND`            | zeus vars                           | 分别归属                        |
| `ZEUS_WORKBENCH_DEPLOY_*`                       | zeus-ui repo                        | ecosystem                       |
| `DEMOS_PAGES_TOKEN`                             | zeus repo                           | ecosystem                       |
| `NPM_TOKEN` / `NPM_PUBLISH_TOKEN`               | 两仓各自                            | 不动                            |

**风险**：admin 与 playground 共用宿主。迁移 admin 到 ecosystem 后，
**两个仓库的部署工作流会操作同一台机器的不同目录**。必须在 Phase 6 前确认：

- 目录隔离（`/home/ubuntu/zeus-admin` vs `/home/ubuntu/zeus-playground`）已存在 ✅
- 容器名隔离（`zeus-admin` vs `zeus-playground`）已存在 ✅
- 但 SSH key 与 user 是同一套 → **建议 ecosystem 用独立 key**，否则一个仓库的凭据泄露会影响另一个

---

## 4. 证据链迁移

### 4.1 必须随应用迁移的证据

| 证据                               | 当前产出方                           | 迁移后    | 缺口                     |
| ---------------------------------- | ------------------------------------ | --------- | ------------------------ |
| admin 镜像 digest + revision label | `admin-image.yml:693-700`            | ecosystem | —                        |
| admin 体积门禁                     | `image-size-gate.mjs` → step summary | ecosystem | **需改 upload-artifact** |
| admin SBOM                         | 无镜像级                             | ecosystem | **需新建**               |
| deployment acceptance              | `deployment-acceptance.ts`           | ecosystem | **需解耦 import**        |
| ai-workbench 双镜像 digest         | `ai-workbench-image.yml:666-675`     | ecosystem | —                        |
| ai-workbench 体积                  | step summary                         | ecosystem | **需改 upload-artifact** |
| ai-workbench provenance            | `provenance: false`                  | ecosystem | **需改为 true**          |
| demo-pairing.json                  | `demos-pages.yml`                    | ecosystem | 跨仓校验需简化           |
| 四产品镜像 provenance              | `product-acceptance.yml:310-338`     | ecosystem | —                        |
| stage1/stage2 部署证据             | `host-deployment-*.yml`              | ecosystem | —                        |

### 4.2 留在原处

| 证据                                      | 归属                             |
| ----------------------------------------- | -------------------------------- |
| 框架 SBOM（`temp/sbom/zeus.cdx.json`）    | zeus（但建议改为 artifact 上传） |
| build-size-report                         | zeus                             |
| cross-platform-evidence                   | zeus                             |
| release-authorization                     | zeus                             |
| ui-release-pairing / ui-publish-preflight | zeus-ui                          |
| component-host-benchmark                  | zeus                             |
| data-grid-benchmark / framework-e2e       | zeus-ui                          |
| showcase artifacts                        | zeus-ui                          |

### 4.3 五个证据缺口必须在新仓库补上

Phase 0 `05-evidence-chain-map.md` §2 列了 6 个缺口。迁移时按此补齐：

| #   | 缺口                                  | 补齐动作                                                     | 阶段                 |
| --- | ------------------------------------- | ------------------------------------------------------------ | -------------------- |
| 1   | 无镜像级 SBOM                         | ecosystem 引入 Syft/CycloneDX，产出 `sbom-admin.cdx.json` 等 | Phase 5              |
| 2   | 体积只写 summary                      | 三个镜像全部加 `upload-artifact`                             | Phase 5              |
| 3   | playground 无 revision label          | 复用 admin 的做法                                            | Phase 5（若留 zeus） |
| 4   | 三个验收脚本未接 CI                   | `playground-online-acceptance` 接进 playground 工作流        | Phase 5              |
| 5   | tarball baseline / pack report 不上传 | ecosystem 与 zeus-ui 各自决定是否需要                        | 低优先               |
| 6   | beta 与 online 配对矛盾               | 澄清并修正 README 或 workflow                                | **Phase 1 后立即**   |

---

## 5. CI 门禁的迁移

设计包 `docs/04-ci-deployment-evidence.md:9-38` 要求三个仓库各自独立 CI。逐条核对迁移后的能力：

### 5.1 zeus（保留）

| 要求                           | 现状                                | 迁移后                                |
| ------------------------------ | ----------------------------------- | ------------------------------------- |
| install / lockfile             | ✅ `pnpm install --frozen-lockfile` | 不变                                  |
| lint / format / typecheck      | ✅ `lint-and-check` job             | 不变                                  |
| Rust 与 TS 测试                | ✅ `rust-compiler` + `test`         | 不变                                  |
| framework contract tests       | ✅ `packed-consumers`               | **需补 framework 断言新宿主（R-03）** |
| examples smoke                 | ✅ 分散在 4 个 browser job          | 不变                                  |
| package build / pack / dry-run | ✅ `build` + `release:verify:pack`  | 不变                                  |

### 5.2 zeus-ui（保留）

| 要求                             | 现状                             | 迁移后               |
| -------------------------------- | -------------------------------- | -------------------- |
| install / lockfile               | ✅                               | 不变                 |
| lint / typecheck                 | ✅ `ci.yml` build job            | 不变                 |
| 组件单元与交互测试               | ✅ `test.yml`                    | 删除 ai-workbench 段 |
| accessibility / keyboard / focus | ✅ `check-dialog-interaction` 等 | 不变                 |
| gallery / docs build             | ✅ `docs.yml` + `showcase.yml`   | 不变                 |
| package build / pack / dry-run   | ✅ `release:verify:*`            | 不变                 |

### 5.3 zeus-ecosystem（新建）

设计包 `docs/04:30-38` 要求 9 项。当前**全部需要新建**：

| 要求                          | 迁移来源                                    | 新建成本 |
| ----------------------------- | ------------------------------------------- | -------- |
| install / lockfile            | 复用 admin-image 的步骤                     | 低       |
| 每个应用 lint/typecheck/build | 复用各应用脚本                              | 低       |
| 应用级单元与集成测试          | `server/__tests__` + `check:admin` 的 25 组 | 中       |
| E2E（按应用分组）             | admin E2E + ai-workbench gates              | 中       |
| 镜像构建                      | 复用 3 个 image workflow                    | 低       |
| image size budget             | 复用 `image-size-gate.mjs`                  | 低       |
| SBOM generation / validation  | **无来源**                                  | **高**   |
| deployment acceptance         | 复用 `deployment-acceptance.ts`（需解耦）   | 中       |
| demo catalog 校验             | 复用 `demo-pairing.ts`                      | 低       |

**SBOM 是唯一需要从零建设的能力**。建议复用 zeus 的 `check-sbom.ts` 的 schema 校验逻辑，
生成侧换用 Syft（对镜像）或 `pnpm licenses list`（对 JS 依赖树）。

---

## 6. 迁移后的反向依赖消除核对

设计包的目标是「无反向边」。逐条核对迁移能消除哪些：

| #   | 反向依赖                                    | 迁移后                                                                                                           | 消除方式                                                           |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ①   | `zeus/examples/admin` → `@zeus-web/*`       | **消除**                                                                                                         | admin 迁出                                                         |
| ②   | `create-zeus` 模板 → `@zeus-web/button`     | **不消除**                                                                                                       | 需 D-04 决策                                                       |
| ③   | `zeus/scripts/release/*` → zeus-ui manifest | **部分消除**                                                                                                     | admin 迁出后 `ui-sources.ts` 仍读 zeus-ui（用于 create-zeus 校验） |
| ④   | 5 个工作流 checkout zeus-ui                 | **3 个消除**（demos-pages、host-deployment-prepare、product-acceptance）；`ci.yml:952` 与 `release.yml:128` 保留 | 迁移编排 + 发布配对                                                |
| ⑤   | `zeus-ui/ai-workbench` → `@zeus-js/*`       | **保留**（这是允许的正向边）                                                                                     | —                                                                  |

**结论：迁移能消除 4 条反向边中的 3 条的关键部分，但无法全部消除。**
残留的两条（② 与 ④ 中的 ci/release）需要在 Phase 7 单独决策。
