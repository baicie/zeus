# Zeus 多仓库职责重构 — Phase 0 全量只读审计

- 审计日期：2026-11-23
- 审计范围：`baicie/zeus`、`baicie/zeus-ui` 两个完整仓库
- 取证基线：`zeus` @ `04b20eed`（main），`zeus-ui` @ `ff2941e3`（main），两仓工作区均干净
- 审计性质：**只读**。未修改任何产品源码、`package.json`、lockfile、CI 或部署配置；未创建仓库、未推送、未发布、未部署
- 本轮唯一写入：本目录下的审计文档

## 先读哪一份

| 文件                            | 回答的问题                                             |
| ------------------------------- | ------------------------------------------------------ |
| `08-baseline-corrections.md`    | **设计包的已知基线有多少已经过期或不成立** — 必须先读  |
| `01-demo-inventory.md`          | 全量 Demo 清单、分类、逐项处置建议                     |
| `02-dependency-topology.md`     | 包级与应用级依赖拓扑、跨仓版本契约、隐藏耦合           |
| `03-test-ownership-map.md`      | `check:admin` 115 条断言的责任拆解、e2e 与 checks 归属 |
| `04-workflow-deployment-map.md` | 17 + 9 个工作流的触发、产物、部署、归属                |
| `05-evidence-chain-map.md`      | SBOM、镜像体积、验收证据的真实产出位置与缺口           |
| `06-risk-register.md`           | 风险登记表                                             |
| `07-open-questions.md`          | 未知事项与需要用户决策的问题                           |

## 执行摘要

### 一、设计包的方向成立，但基线数字大面积失真

设计包 `README.md:30-41` 与 `docs/07-assumptions-open-questions.md:7-17` 列出的十条基线，逐条核验后 **3 条成立、4 条不准确、3 条不成立**（详见 `08-baseline-corrections.md`）。最需要修正的三条：

1. **「`admin-image.yml` 是当前唯一生产镜像部署」不成立。** 实际有 **3 个生产部署工作流、4 个生产镜像**：
   - `zeus/.github/workflows/admin-image.yml:480` → `zeus-admin`
   - `zeus/.github/workflows/playground-image.yml:231` → `zeus-playground`
   - `zeus-ui/.github/workflows/ai-workbench-image.yml:448` → `zeus-ai-workbench` + `zeus-ai-host`（两镜像）

   Admin 不是孤例。迁移必须同时规划 Playground 与 AI Workbench 的归属与切换顺序。

2. **「`zeus` 框架包对 `@zeus-web/*` 零依赖」只对 `packages/*/src` 成立，对发布物不成立。**
   `packages/create/create-zeus/templates/webc-consumer-ts/package.json:13` 把
   `@zeus-web/button: 0.1.0-beta.34` 打进已发布的 `create-zeus`（`files: ['dist','templates']`）。
   这是**产品包对 UI 包的反向依赖**，会随 `create-zeus` 一起发布给用户。
3. **「`zeus` 当前依赖 `zeus-ui@0.1.0-beta.34`」不成立。** `zeus` 根 `package.json` 的 `dependencies` 为空；
   仓库内名为 `zeus-ui` 的包是 `packages/create/zeus-ui`，版本 `0.0.1`，是一个**脚手架 CLI**，与 UI 产品仓无关。
   同时该包占用了 npm 上的 `zeus-ui` 包名（`dist-tags.latest = 0.0.1`），而 zeus-ui 仓库根包叫
   `zeus-ui-workspace`——**UI 产品仓无法用自己的仓库名发布包**。

### 二、真正的反向依赖比设计包描述得更广，但形态不同

设计包假设反向耦合主要来自 `examples/admin`。实际有四类，重要程度递减：

| 类别                | 具体形态                                                                                                                       | 证据                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 应用源码依赖        | `examples/admin` 消费 24 个 `@zeus-web/*@0.1.0-beta.34` + 1 个 `file:` vendor                                                  | `examples/admin/package.json:20-44`                                                                                                    |
| **发布物依赖**      | `create-zeus` 模板钉 `@zeus-web/button@0.1.0-beta.34`                                                                          | `packages/create/create-zeus/templates/webc-consumer-ts/package.json:13`                                                               |
| CI/发布工具链依赖   | `rc-dry-run.ts`、`rc-manifest.ts`、`ui-sources.ts`、`candidate-pair.ts`、`ui-attestation.ts` 直接读 zeus-ui 的 manifest 与 tag | `scripts/release/ui-sources.ts:8-11,181,232`                                                                                           |
| 工作流跨仓 checkout | 5 个 zeus 工作流 checkout 或 clone `baicie/zeus-ui`                                                                            | `ci.yml:952-958`、`demos-pages.yml:98-107`、`host-deployment-prepare.yml:38-43`、`product-acceptance.yml:35-39`、`release.yml:128-136` |

`create-zeus` 那条最容易被漏掉：它不是 example，而是**已发布产品的一部分**。只搬 admin 无法消除它。

### 三、阻断 Phase 4 迁移的硬事实：0.2.0 线从未发布

设计包要求「ecosystem 只消费已发布的 `@zeus-js/*` 与 `@zeus-web/*`」。当前事实：

- npm 上 `@zeus-js/zeus` 共 180 个版本，**没有任何 `0.2.0`**；`beta` 指向 `0.1.1-beta.20`，`latest` 指向 `0.1.0`（`npm view @zeus-js/zeus versions/dist-tags`）
- `zeus` 源码树版本为 `0.2.0-rc.3`
- npm 上 `@zeus-web/*` 的 `beta` 指向 `0.1.0-beta.34`；`0.1.0-beta.35` 未发布
- `examples/admin` 用 `workspace:*` 消费 5 个 `@zeus-js/*`，用 `beta.34` + `file:` vendor 消费 UI

**结论：把 admin 原样搬到只消费已发布包的新仓库，在今天的 registry 状态下无法复现其行为。**
必须先发布 0.2.0 线（或为迁移期开一条受控例外），否则 Phase 4 无法启动。这是 Phase 1 必须回答的问题，见 `07-open-questions.md` Q1。

### 四、`check:admin` 不能整文件归属，这一点设计包判断正确

`scripts/check/check-admin.ts`（964 行）实测 **115 条 `expect` 调用点，分 42 组**：

| 责任层                                                          | 断言数 |  占比 |
| --------------------------------------------------------------- | -----: | ----: |
| integration（Router+Query+UI+页面流程）                         |     49 | 42.6% |
| component（Dialog/DataGrid/表单/Tabs/Accordion/Switch）         |     30 | 26.1% |
| framework（Runtime ref 契约、Router 历史/深链、i18n、DevTools） |     30 | 26.1% |
| application（Server API、会话、构建预检）                       |      6 |  5.2% |

按文件整体搬迁会同时带走三层的契约。逐组映射见 `03-test-ownership-map.md`。

### 五、Demo 盘点的量级

| 仓库               |                                                目录 | 分类结果                                                                                            |
| ------------------ | --------------------------------------------------: | --------------------------------------------------------------------------------------------------- |
| `zeus/examples`    | 21（20 个 workspace 包 + 1 个非 workspace fixture） | 产品级应用 2（admin、playground-editor）；框架最小示例 4；组件展示 7；集成/绑定 5；fixture/参照 3   |
| `zeus-ui/examples` |                                                  16 | 应用 1（ai-workbench）+ 服务端 1（ai-host）；组件画廊 5；绑定验证 6；元数据库 1；测试夹具 1；空壳 2 |
| `zeus-ui/apps`     |                                           1（docs） | 组件文档站（GitHub Pages 部署）                                                                     |

两仓合计 **38 个 Demo 单元**。其中 **只有 3 个有生产部署**（admin、playground-editor、ai-workbench + ai-host）。

### 六、必须提醒的一个架构事实

**全生态唯一的 `@zeus-js/router` + `@zeus-js/query` 应用级消费证据在 `zeus/examples/admin`。**
`zeus-ui/examples` 下 16 个目录对 `@zeus-js/router`、`@zeus-js/query` 的引用数为 **0**（全目录 grep 无命中），
它们用的路由是 `@tanstack/react-router`、`vue-router`、`react-router-dom`，状态是组件本地 state。

这意味着：admin 一旦迁出 `zeus`，`zeus` 仓库内将不再有任何 Router/Query 的集成消费方。
Phase 7「zeus 清理」时必须同时决定 Router/Query 的集成验证放在哪里，否则会出现
「框架包有自己的单测、但没有任何真实应用在用」的证据断层。

### 七、发现的两个额外结构缺陷

1. **`@zeus-ui` scope 被两个仓库同时占用。**
   - `zeus/examples/headless` 的包名是 `@zeus-ui/headless`（`private: true`），被 5 个 zeus 示例以 `workspace:*` 消费
   - `zeus/packages/create/registry` 的包名是 `@zeus-ui/registry`，**且可发布**（无 `private`）
   - 这与 `@zeus-web/*` 构成命名冲突：`@zeus-ui/registry`（zeus 仓）与 `@zeus-web/registry`（zeus-ui 仓）是两个不同产品

   拆仓时如果不处理，`@zeus-ui` 会成为第三个事实上的共享 scope，与「三仓独立」目标冲突。

2. **`zeus-ui` 仓库无法用自己的仓库名发布。** npm 上的 `zeus-ui` 已被 `zeus/packages/create/zeus-ui` 占用（`0.0.1`）。
   若 UI 仓将来要发布一个名为 `zeus-ui` 的元包，需要先处理这个包名。

## 审计方法

- 8 个专项审计并行执行，覆盖 admin、playground、check-admin 断言、zeus 工作流、docs 与包拓扑、zeus-ui examples、e2e 与 checks、zeus-ui 工作流
- 所有事实标注 **VERIFIED**（附路径:行号或命令输出）/ **INFERRED**（由已读证据推导）/ **UNKNOWN**（未取证）
- 规模统计一律排除 `node_modules`、`dist`、`.next`、`.vitepress/dist`
- 对设计包声称的数字**逐条复核**，不复述、不沿用

## 未做的事（明确边界）

- 未运行 `pnpm install`、未构建、未跑测试。所有测试相关结论来自源码阅读与配置解析，不是执行结果
- 未访问 GitHub Actions 的历史 run，未核对线上部署的真实状态
- 未审计 `docs/` 内容、`crates/` 编译器内部、`packages/*/src` 的实现质量——这些不在本轮范围
- 未判断迁移后的新仓库名、公开/私有策略、Secrets 归属——这些是用户决策
