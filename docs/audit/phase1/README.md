# Phase 1 — 冻结职责边界与迁移清单

- 日期：2026-11-23
- 输入：`docs/audit/phase0/`（13 份产物，基于 `zeus@04b20eed` / `zeus-ui@ff2941e3`）
- 性质：**仍然只读**。本阶段只输出决策文档与清单，不改产品源码、依赖、CI 或部署配置
- 状态：**待用户确认**。确认后才进入 Phase 2

## 本阶段做了什么

把 Phase 0 的 38 个 Demo 单元、26 个工作流、115 条断言，从「已盘点」推进到「已定归属」。
每个对象都有明确目标或显式的 `investigate`；所有生产资产都有承接方；所有重要断言都有目标归属。

## 文档索引

| 文件                              | 内容                                             |
| --------------------------------- | ------------------------------------------------ |
| `01-final-inventory.md`           | 最终 Demo Inventory（含 Phase 0 之后的决策变更） |
| `02-migration-matrix.csv`         | `source → destination` 迁移矩阵（机器可读）      |
| `03-dependency-migration-plan.md` | 逐包版本变更、发布顺序、兼容矩阵                 |
| `04-test-assertion-map.csv`       | 逐组断言映射（115 条 → 目标归属）                |
| `05-workflow-evidence-plan.md`    | 工作流、部署、证据的迁移映射                     |
| `06-sequencing-and-rollback.md`   | 迁移顺序、风险门禁、回滚计划                     |
| `07-decisions-required.md`        | 需要你拍板的决策（含默认建议）                   |

## 三条不可协商的冻结结论

### 冻结 1 — Admin 必须七拆，不整体搬迁

Phase 1 明确要求把 Admin 拆成 7 个部分。实测证据支持这个要求：

| #   | 部分                     | 载体                                                              | 目标                                |
| --- | ------------------------ | ----------------------------------------------------------------- | ----------------------------------- |
| 1   | 组件 Gallery             | `src/gallery.tsx`（836 行，20 包）+ `main.tsx:15-59` 的 22 个注册 | zeus-ui                             |
| 2   | 组件自身行为测试         | `check:admin` 的 12 个组件组                                      | zeus-ui（**已有更强覆盖，不复制**） |
| 3   | 框架契约测试             | `check:admin` 的 6 个 framework 组                                | zeus（**需新建宿主**）              |
| 4   | 应用集成测试             | `check:admin` 的 13 个 integration 组                             | zeus-ecosystem                      |
| 5   | E2E                      | `check:admin` 的浏览器流程 + `server/__tests__`                   | zeus-ecosystem                      |
| 6   | 生产镜像与部署           | `Dockerfile` + `deploy/` + `admin-image.yml`                      | zeus-ecosystem                      |
| 7   | SBOM / size / acceptance | `check-sbom.ts`、`image-size-gate`、`deployment-acceptance.ts`    | zeus-ecosystem（需新建镜像级 SBOM） |

### 冻结 2 — `zeus-ui/examples` 不迁出

Phase 0 曾把它列为 Q3 候选。Phase 1 的决策标准给出明确答案：
**组件展示、组件 API、组件交互、组件自身测试留在 zeus-ui**。

`zeus-ui/examples` 的 16 个目录里有 5 个是组件画廊（react/vue/advanced/native showcase + ai-showcase）、
6 个是绑定验证、1 个元数据库、1 个夹具。它们**不是应用**（无认证、无持久化、无真实 API、无独立部署）。
唯一例外是 `ai-workbench` + `ai-host`——它们是应用，迁 ecosystem。

**否决搬走 showcase 的理由**（除决策标准外还有硬约束）：
`check-showcase-implementation.ts`、`check-showcase-metadata.ts`、`check-product-contract.ts`、`check-examples.ts`
四个脚本 + 根 `site:check` 双重锁定它们。搬走会打断 registry/CLI 同步链路，收益为零。

### 冻结 3 — 三个生产产品各自独立决策，不打包

Phase 0 修正了设计包「唯一生产部署」的错误。Phase 1 据此把它们拆开：

| 产品                | 归属             | 切换顺序 | 理由                                                             |
| ------------------- | ---------------- | -------- | ---------------------------------------------------------------- |
| Admin               | zeus-ecosystem   | **最后** | 唯一的 `@zeus-js/router`+`query` 消费方，承担 framework 断言宿主 |
| AI Workbench + Host | zeus-ecosystem   | 中       | zeus-ui 唯一容器部署；与 UI 组件无运行时耦合                     |
| Playground          | **zeus（建议）** | 不迁     | 见 `07-decisions-required.md` D-02                               |

## 与 Phase 0 的差异

Phase 0 有 8 处 `investigate`。Phase 1 依据决策标准收敛为 3 处，其余全部定案：

| 对象                              | Phase 0     | Phase 1                      | 依据                                        |
| --------------------------------- | ----------- | ---------------------------- | ------------------------------------------- |
| `examples/playground-editor`      | investigate | **keep in zeus**（待你确认） | 零 `@zeus-web` 依赖；是编译器能力的旗舰演示 |
| `examples/headless` + 5 个消费者  | investigate | **move to zeus-ui**          | 是 `@zeus-ui/headless` 组件库，属组件展示   |
| `examples/project-board`          | investigate | **keep in zeus**             | 单文件、无路由/持久化/网络，属框架能力演示  |
| `zeus-ui/ai-showcase`             | investigate | **keep in zeus-ui**          | hash 路由的组件故事画廊，无后端             |
| `examples/stencil-wrapper`        | investigate | **retire**（待你确认）       | 0 个 `@zeus-js` 依赖，是外部方案对照物      |
| `vanilla`/`vite-react`/`vite-vue` | investigate | **retire**（待你确认）       | 无 check/test/CI，14-115 行的空壳           |
| `vite-vue2`                       | retire      | **retire**                   | 名实不符（声称 Vue 2，依赖 Vue 3）          |
| `create-zeus` 模板                | investigate | **保留 + 登记例外**          | 见 `07-decisions-required.md` D-04          |

**仍未定案**：`examples/fixtures/third-party-output-plugin`（保留，无需决策）、
`zeus-ui/temp/` 的历史证据（不属 Demo，不处理）。

## 退出条件核对

设计包 `prompts/02:49-51` 要求四条：

- [x] **每个已知项目都有决策** — 38 个 Demo 单元全部有 `keep`/`move`/`split`/`retire`/`investigate`，
      其中 35 个已定案、3 个待你确认（见 `07-decisions-required.md`）
- [x] **所有生产相关资产都有明确目标** — 4 个镜像、6 个 Pages 站点、26 个工作流均有归属
- [x] **所有重要断言有目标归属** — 115 条 `check:admin` 断言 + 82 条 server 断言逐组映射
- [x] **未知项显式列出** — `07-decisions-required.md` 的 U 系列 8 项

## 本阶段没有做

- 未创建 `zeus-ecosystem` 仓库
- 未修改任何 `package.json`、lockfile、workflow、部署配置
- 未运行构建或测试
- 未推送任何迁移提交

上述都需要你的明确授权。
