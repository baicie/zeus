# 最终 Demo Inventory（Phase 1 定案）

分类：`framework` / `component` / `integration` / `application` / `fixture` / `benchmark` / `unknown`
决策：`keep` / `move` / `split` / `merge` / `retire` / `investigate`

与 Phase 0 的差异只在「决策」列。分类未变（Phase 0 的分类全部维持）。

> **2026-11-23 状态同步。** 本文件写于 Phase 1 定案时，当时下表全部是**计划**。
> Phase 2 已执行并合并（zeus-ui #153，squash `629bd69e`），因此 `move` 到 zeus-ui
> 的 6 项状态改变；`split`/`retire`/`keep` 均未执行。
> 证据等级：**VERIFIED** = 已核对仓库实际内容；**INFERRED** = 由配置或日志推断；
> **UNKNOWN** = 无法从现有材料确认。

---

## A. `zeus/examples` — 21 个

| #   | 路径                                 | 分类        | Phase 0     | **Phase 1 定案**        | 目标仓库                        | 待确认 |
| --- | ------------------------------------ | ----------- | ----------- | ----------------------- | ------------------------------- | ------ |
| 1   | `admin`                              | application | split       | **split（七拆）**       | zeus-ecosystem + zeus-ui + zeus | —      |
| 2   | `playground-editor`                  | application | investigate | **keep**                | zeus                            | D-02   |
| 3   | `headless`                           | fixture     | investigate | **move**                | zeus-ui                         | —      |
| 4   | `headless-demo`                      | component   | move        | **move**（随 headless） | zeus-ui                         | —      |
| 5   | `context`                            | framework   | keep        | **keep**                | zeus                            | —      |
| 6   | `counter`                            | framework   | keep        | **keep**                | zeus                            | —      |
| 7   | `todo`                               | framework   | keep        | **keep**                | zeus                            | —      |
| 8   | `light-dom-slots`                    | framework   | keep        | **keep**                | zeus                            | —      |
| 9   | `project-board`                      | integration | investigate | **keep**                | zeus                            | —      |
| 10  | `next-boundary`                      | integration | keep        | **keep**                | zeus                            | —      |
| 11  | `web-component`                      | component   | keep        | **keep**                | zeus                            | —      |
| 12  | `devtools-panel`                     | integration | keep        | **keep**                | zeus                            | —      |
| 13  | `react-wrapper`                      | integration | keep        | **keep**                | zeus                            | —      |
| 14  | `vue-wrapper`                        | integration | keep        | **keep**                | zeus                            | —      |
| 15  | `stencil-wrapper`                    | fixture     | investigate | **retire**              | —                               | D-03   |
| 16  | `registry-react`                     | component   | move        | **move**                | zeus-ui                         | —      |
| 17  | `registry-vue`                       | component   | move        | **move**                | zeus-ui                         | —      |
| 18  | `use-headless-cli`                   | component   | move        | **move**                | zeus-ui                         | —      |
| 19  | `use-headless-react`                 | component   | move        | **move**                | zeus-ui                         | —      |
| 20  | `use-headless-vue`                   | component   | move        | **move**                | zeus-ui                         | —      |
| 21  | `fixtures/third-party-output-plugin` | fixture     | keep        | **keep**                | zeus                            | —      |

**小计**：keep 12、move 6、split 1、retire 1、investigate 0、待确认 2

### A0 — Phase 2 执行后的实际状态（VERIFIED）

第 3、4、16–20 行（共 **7 个目录**：`headless` 本身 + 6 个消费者）已在 Phase 2 迁入 zeus-ui，合并于 zeus-ui #153
（squash `629bd69e`）。zeus 侧的同名目录**仍然存在**——这是有意的双轨，不是遗漏：

| 目录                 | zeus 侧 | zeus-ui 侧 | 说明                        |
| -------------------- | ------- | ---------- | --------------------------- |
| `headless`           | 保留    | 已迁入     | 计划在 Phase 7 清理 zeus 侧 |
| `headless-demo`      | 保留    | 已迁入     | 同上                        |
| `registry-react`     | 保留    | 已迁入     | 同上                        |
| `registry-vue`       | 保留    | 已迁入     | 同上                        |
| `use-headless-cli`   | 保留    | 已迁入     | 同上                        |
| `use-headless-react` | 保留    | 已迁入     | 同上                        |
| `use-headless-vue`   | 保留    | 已迁入     | 同上                        |

**注意：双轨保留不等于依赖环已消除。** zeus 侧仍引用 `@zeus-ui/headless`，
其 `tsconfig.json` 的 paths 别名直接指向 `./examples/headless/src`。
依赖环的验收在 Phase 7（门禁 G7），当前**未达成**。

zeus-ui #153 的 CI 结果：**34 项成功、5 项跳过、0 项失败**（VERIFIED，
读取 GitHub Actions check-runs API）。

### A1 — `headless` 迁移的连带影响

`examples/headless` 的包名是 `@zeus-ui/headless`（**`@zeus-ui` scope**，private，`0.0.1`）。
被 5 个示例以 `workspace:*` 消费：`headless-demo`、`registry-react`、`registry-vue`、`use-headless-cli`、`use-headless-react`、`use-headless-vue`（6 个，含 headless-demo）。

**迁移顺序必须是**：`headless` 先迁 → 6 个消费者后迁。
迁到 zeus-ui 后，`@zeus-ui/headless` 会与 zeus-ui 现有的 `@zeus-web/*` 命名并存。
**决策 D-05 需要你定**：迁入后是否改名为 `@zeus-web/headless`（zeus-ui 已有同名包？需核实）还是保留 `@zeus-ui/headless`。

### A2 — `admin` 七拆的落点

| 部分                 | 源                                               | 目标                | 说明                                                   |
| -------------------- | ------------------------------------------------ | ------------------- | ------------------------------------------------------ |
| Gallery              | `src/gallery.tsx` + 22 个 `wc/auto` 注册         | zeus-ui `apps/docs` | 与 docs 现有 29 组件页合并评估                         |
| 组件行为测试         | `check:admin` 组 5,8,21-33                       | zeus-ui             | **不复制**，已有 `check-dialog-interaction` 等更强覆盖 |
| 框架契约测试         | `check:admin` 组 14,17-19,36,41                  | zeus                | **需新建宿主**（关键风险 R-03）                        |
| 应用集成测试         | `check:admin` 组 3,6,7,9-13,15,16,20,34,35,37,39 | zeus-ecosystem      | 随应用迁                                               |
| E2E + Server 测试    | `server/__tests__` 26 it + 浏览器流程            | zeus-ecosystem      | 随应用迁                                               |
| 镜像与部署           | `Dockerfile`、`deploy/`、`admin-image.yml`       | zeus-ecosystem      | Phase 6 切换                                           |
| SBOM/size/acceptance | 见 `05-workflow-evidence-plan.md`                | zeus-ecosystem      | 需新建镜像级 SBOM                                      |

---

## B. `zeus-ui/examples` — 16 个

| #   | 路径                         | 分类        | Phase 0     | **Phase 1 定案**              | 目标仓库       | 待确认 |
| --- | ---------------------------- | ----------- | ----------- | ----------------------------- | -------------- | ------ |
| 1   | `ai-workbench`               | application | move        | **move**                      | zeus-ecosystem | —      |
| 2   | `ai-host`                    | application | move        | **move**（与 workbench 同批） | zeus-ecosystem | —      |
| 3   | `react-showcase`             | component   | keep        | **keep**                      | zeus-ui        | —      |
| 4   | `vue-showcase`               | component   | keep        | **keep**                      | zeus-ui        | —      |
| 5   | `advanced-showcase`          | component   | keep        | **keep**                      | zeus-ui        | —      |
| 6   | `native-showcase`            | component   | keep        | **keep**                      | zeus-ui        | —      |
| 7   | `showcase-shared`            | fixture     | keep        | **keep**                      | zeus-ui        | —      |
| 8   | `ai-showcase`                | component   | investigate | **keep**                      | zeus-ui        | —      |
| 9   | `data-grid-react18-consumer` | fixture     | keep        | **keep**                      | zeus-ui        | —      |
| 10  | `next-app`                   | integration | keep        | **keep**                      | zeus-ui        | —      |
| 11  | `native-wc`                  | integration | keep        | **keep**                      | zeus-ui        | —      |
| 12  | `react-vite`                 | integration | keep        | **keep**                      | zeus-ui        | —      |
| 13  | `vanilla`                    | integration | investigate | **retire**                    | —              | D-03   |
| 14  | `vite-react`                 | integration | investigate | **retire**                    | —              | D-03   |
| 15  | `vite-vue`                   | integration | investigate | **retire**                    | —              | D-03   |
| 16  | `vite-vue2`                  | integration | retire      | **retire**                    | —              | D-03   |

**小计**：keep 11、move 2、retire 3（+1 已定 retire）、investigate 0、待确认 3

### B1 — `ai-workbench` + `ai-host` 的迁移包

不可拆分。迁移时必须同批带走：

| 项              | 位置                                                                                | 原因                               |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| 两个应用目录    | `examples/ai-workbench`、`examples/ai-host`                                         | 一个是客户端，一个是它的服务端半身 |
| 两个 Dockerfile | 各自目录下                                                                          | `ai-workbench-image.yml` 同时构建  |
| 部署配置        | `examples/ai-workbench/deploy/{nginx.conf,entrypoint.sh,docker-compose.deploy.yml}` | 运行时依赖                         |
| 7 个 gate 脚本  | `scripts/checks/ai/check-ai-workbench-*.ts`                                         | 全部 `import { startAiHost }`      |
| 2 个工作流      | `ai-workbench.yml`、`ai-workbench-image.yml`                                        | 门禁 + 生产部署                    |
| 2 个测试项目    | `unit-jsdom` 中的 ai-workbench 段、`ai-browser-e2e`                                 | 现挂在 zeus-ui 的 vitest           |

**连带影响**：迁走后 zeus-ui 的 `unit-jsdom` 需移除 `examples/ai-workbench/__tests__` 的 include；
`ai-browser-e2e` 的 `setup.ts` 指向 `examples/ai-showcase`（**不是** ai-workbench），
所以 `ai-browser-e2e` 应**留在 zeus-ui**（它驱动的是 ai-showcase，留在原地的组件画廊）。

---

## C. `zeus-ui/apps` — 1 个

| #   | 路径        | 分类      | Phase 0 | **Phase 1 定案** | 目标仓库 |
| --- | ----------- | --------- | ------- | ---------------- | -------- |
| 1   | `apps/docs` | component | keep    | **keep**         | zeus-ui  |

---

## D. 汇总

### D1 — 按决策

| 决策         | 数量 | 对象                                                                                           |
| ------------ | ---: | ---------------------------------------------------------------------------------------------- |
| keep         |   24 | 12 个 zeus 示例 + 11 个 zeus-ui 示例 + docs                                                    |
| move         |    8 | headless 及其 5 个消费者、ai-workbench、ai-host                                                |
| split        |    1 | admin（七拆）                                                                                  |
| retire       |    4 | stencil-wrapper、vanilla、vite-react、vite-vue、vite-vue2（5 个，其中 vite-vue2 Phase 0 已定） |
| investigate  |    0 | —                                                                                              |
| **待你确认** |    5 | playground-editor、stencil-wrapper、vanilla、vite-react、vite-vue                              |

> 注：`retire` 的 4 个中，`stencil-wrapper`/`vanilla`/`vite-react`/`vite-vue` 需要你确认（D-03），
> `vite-vue2` 无需确认（名实不符，证据充分）。
> 因此「待确认」实际是 5 个对象（playground-editor + 4 个 retire 候选）。

### D2 — 按目标仓库

**计划值**（Phase 1 定案时）：

| 目标                   |                                          迁入 |                            迁出 | 净变化  |
| ---------------------- | --------------------------------------------: | ------------------------------: | ------- |
| zeus                   |                                             0 | 7（admin 部分 + headless 系 6） | −7 目录 |
| zeus-ui                |                    7（headless 系 + gallery） |      2（ai-workbench、ai-host） | +5      |
| zeus-ecosystem（新建） | 4（admin、ai-workbench、ai-host、+ 部署资产） |                               — | +4      |
| 废弃                   |                                             5 |                               — | —       |

**截至 2026-11-23 的实际值**（VERIFIED）：

| 目标                   | 实际迁入 | 实际迁出 | 净变化 | 说明                                           |
| ---------------------- | -------: | -------: | ------ | ---------------------------------------------- |
| zeus                   |        0 |        0 | 0      | 双轨保留，清理在 Phase 7                       |
| zeus-ui                |    **7** |        0 | **+7** | headless 系 7 个已迁入；ai-workbench/host 未迁 |
| zeus-ecosystem（新建） |        0 |        — | 0      | 仓库尚未创建                                   |
| 废弃                   |        0 |        — | —      | retire 项一项都未执行                          |

修正说明：计划表的 zeus-ui「迁入 7」把 admin gallery 算在内（属可选 2c），
而 headless 系本身即 7 个。实际迁入的 7 个**全部是 headless 系**，gallery 未做。

### D2b — 明确未执行的项（截至 2026-11-23）

Phase 2 只执行了 headless 系迁移。以下项**一项都未执行**，不要把它们读成已完成：

| 项                                                                       | 状态         | 计划阶段  | 证据等级                                              |
| ------------------------------------------------------------------------ | ------------ | --------- | ----------------------------------------------------- |
| **Admin**（`zeus/examples/admin`）                                       | **未迁移**   | Phase 6   | VERIFIED（目录仍在 zeus）                             |
| **AI Workbench**（`zeus-ui/examples/ai-workbench`）                      | **未迁移**   | Phase 4-1 | VERIFIED（目录仍在 zeus-ui）                          |
| **AI Host**（`zeus-ui/examples/ai-host`）                                | **未迁移**   | Phase 4-1 | VERIFIED（目录仍在 zeus-ui）                          |
| Gallery 合并（2c）                                                       | **DEFERRED** | Phase 2c  | VERIFIED（`apps/docs` 无 gallery 引用）               |
| 五项 retire（stencil-wrapper、vanilla、vite-react、vite-vue、vite-vue2） | 未执行       | Phase 7   | VERIFIED（目录均仍在）                                |
| zeus 侧 7 个目录清理                                                     | 未执行       | Phase 7   | VERIFIED                                              |
| `zeus-ecosystem` 创建                                                    | 未执行       | Phase 3   | VERIFIED（`git ls-remote` 返回 Repository not found） |

### D3 — 完整性

- Phase 0 盘点 38 个 Demo 单元，本表覆盖 **38 个**（21 + 16 + 1）
- 无遗漏项
- `zeus-ui/benchmarks/web-c-instances` 与 `zeus/scripts/bench/fixtures/*` 属基准夹具，不在 Demo 范围
