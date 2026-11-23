# 依赖迁移计划

Phase 1 要求「每个项目的依赖迁移计划」。本文件给出**逐包、逐版本**的变更，以及迁移前后必须成立的约束。

---

## 1. 迁移的三条版本前提

所有迁移动作都依赖这三个前提。任一不成立，对应阶段不得开始。

| #   | 前提                                        | 现状                                                                                | 阻断                    |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------- |
| P1  | `@zeus-js/*` 有 `0.2.0` 发布                | **无**（npm 180 个版本，最新 `0.1.1-canary.20261027`，`beta` 指向 `0.1.1-beta.20`） | Phase 4 全部            |
| P2  | `@zeus-web/*` 有 `0.1.0-beta.35` 或更高发布 | **无**（`beta` 指向 `0.1.0-beta.34`）                                               | 删除 vendor；admin 迁移 |
| P3  | `@zeus-js/router` + `query` 有可用的 0.2.0  | 随 P1                                                                               | admin 迁移              |

**P1 的实际含义**：`zeus` 源码树是 `0.2.0-rc.3`，说明 RC 已在仓库内就绪但未发布。
Phase 1 建议：先走一次完整的 `release.yml` 发布 `0.2.0-rc.3`（走 Release environment），
验证 registry 可达后再启动 Phase 4。

---

## 2. Admin 的依赖迁移

### 2.1 `@zeus-js/*`：`workspace:*` → 已发布版本

| 包                                  | 当前          | 迁移后                      | 变更                       |
| ----------------------------------- | ------------- | --------------------------- | -------------------------- |
| `@zeus-js/zeus`                     | `workspace:*` | `0.2.0-rc.3`（或当时的 RC） | 精确 pin                   |
| `@zeus-js/router`                   | `workspace:*` | 同上                        | 精确 pin                   |
| `@zeus-js/query`                    | `workspace:*` | 同上                        | 精确 pin                   |
| `@zeus-js/resource`                 | `workspace:*` | 同上                        | 精确 pin                   |
| `@zeus-js/i18n`                     | `workspace:*` | 同上                        | 精确 pin                   |
| `@zeus-js/vite-plugin`（dev）       | `workspace:*` | `0.0.5`（当时的版本）       | 独立版本线，注意不是 0.2.x |
| `@zeus-js/devtools-consumer`（dev） | `workspace:*` | `0.1.1-beta.14`             | 独立版本线                 |

**风险**：`vite-plugin` 与 `devtools-consumer` 是**独立版本线**，不随 0.2.0 发布。
迁移时容易误写成 `0.2.0-rc.3`。AC-04 校验这条。

### 2.2 `@zeus-web/*`：24 个 pinned → 统一 beta.35+

| 当前                                                  | 迁移后                                       |
| ----------------------------------------------------- | -------------------------------------------- |
| 24 个 `0.1.0-beta.34`                                 | 统一的 `0.1.0-beta.35`（或更高，与 P2 一致） |
| `@zeus-web/dialog: file:../../vendor/zeus-web-dialog` | `0.1.0-beta.35`（registry 版本）             |

**删除 vendor 的六个门槛**（Phase 0 `02-dependency-topology.md` §2.4）逐条对应：

| 门槛                               | 迁移时如何满足                                    |
| ---------------------------------- | ------------------------------------------------- |
| 上游正式包含所需能力               | P2 完成（beta.35 发布）                           |
| vendor 功能有明确替代              | registry 的 `@zeus-web/dialog@beta.35`            |
| 替代版本通过类型检查/构建/行为测试 | 在 ecosystem 跑 `check-dialog-interaction` 三引擎 |
| 生产 Demo/E2E 不再引用 vendor      | 删除 `examples/admin/package.json:29` 的 `file:`  |
| SBOM 中 vendor 记录消失            | 对比迁移前后 SBOM 组件清单                        |
| 回滚方案存在                       | 保留 `vendor/` 目录直到下一个稳定版本             |

### 2.3 Admin 的依赖迁移前后对照

```
迁移前（workspace）
  @zeus-js/*  workspace:*            ← monorepo 内链接
  @zeus-web/* 0.1.0-beta.34 × 24     ← registry
  @zeus-web/dialog file:../../vendor ← 本地路径

迁移后（ecosystem）
  @zeus-js/*  0.2.0-rc.3 × 5         ← registry，精确 pin
  @zeus-web/* 0.1.0-beta.35 × 25     ← registry，精确 pin
  vendor      （删除）
```

**反向验证**：迁移完成后，ecosystem 的 `node_modules` 里不应出现任何指向上游源码的相对路径。
校验方式：`grep -r "file:\|link:\|workspace:" package.json` 必须无命中。

---

## 3. AI Workbench + Host 的依赖迁移

### 3.1 `@zeus-js/*`

| 包                            | 当前            | 迁移后                                   |
| ----------------------------- | --------------- | ---------------------------------------- |
| `@zeus-js/zeus`               | `0.1.1-beta.20` | `0.2.0-rc.3`（**跨大版本**，需行为验证） |
| `@zeus-js/runtime-dom`        | `0.1.1-beta.20` | `0.2.0-rc.3`                             |
| `@zeus-js/vite-plugin`（dev） | `0.0.5`         | `0.0.5`（如无新版本则不变）              |

**这是全迁移中唯一一处 `0.1.1 → 0.2.0` 的跨版本跳变。**
`ai-workbench` 用 `jsxImportSource: "@zeus-js/zeus"`，依赖编译器输出。
RC 与 beta.20 的编译器输出可能有差异，必须用它的 7 个 gate 验证。

### 3.2 `@zeus-web/*`

| 包                        | 当前          | 迁移后          |
| ------------------------- | ------------- | --------------- |
| `@zeus-web/ai-core`       | `workspace:*` | `0.1.0-beta.35` |
| `@zeus-web/ai-adapters`   | `workspace:*` | `0.1.0-beta.35` |
| `@zeus-web/ai-primitives` | `workspace:*` | `0.1.0-beta.35` |
| `@zeus-web/ai-wc`         | `workspace:*` | `0.1.0-beta.35` |

**注意**：这 4 个包在 zeus-ui 内部是 `workspace:*`，迁移后变成 registry 依赖。
它们的 `publishConfig.access = public`，可以发布。

### 3.3 连带删除

迁移完成后，`zeus-ui/examples` 下不再有 `ai-workbench` / `ai-host`。必须同步：

| 项                       | 位置                           | 动作                                             |
| ------------------------ | ------------------------------ | ------------------------------------------------ |
| `unit-jsdom` 的 include  | `zeus-ui/vitest.config.ts:283` | 移除 `examples/ai-workbench/__tests__/*.spec.ts` |
| 7 个 gate 脚本           | `zeus-ui/scripts/checks/ai/*`  | 随应用迁出                                       |
| `ai-workbench.yml`       | `.github/workflows/`           | 随应用迁出                                       |
| `ai-workbench-image.yml` | `.github/workflows/`           | 随应用迁出                                       |
| 根 scripts               | `package.json:120-126`         | 移除 `check:ai-workbench*` 等 8 条               |

**保留**：`ai-browser-e2e`（`e2e/ai-browser/*`）——它驱动的是 `examples/ai-showcase`，
而 ai-showcase **留在 zeus-ui**。这是一个容易误删的点。

---

## 4. `@zeus-ui/headless` 迁移（撞名处理）

### 4.1 撞名事实

| 包                   | 仓库    | 版本               | exports                                                                        | 内容                                                                      |
| -------------------- | ------- | ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `@zeus-web/headless` | zeus-ui | `0.1.0-beta.35`    | 仅 `.`                                                                         | **聚合器**：re-export 24 个 `@zeus-web/*` primitives                      |
| `@zeus-ui/headless`  | zeus    | `0.0.1`（private） | `.`, `./wc`, `./wc/*`, `./react`, `./vue`, `./vue/global`, `./styles.css`, ... | **独立组件库**：6 个组件（button/checkbox/dialog/icon/input/switch/tabs） |

**它们不是同一个东西。** zeus 的 `@zeus-ui/headless` 是一个用 Zeus JSX 手写的轻量组件库，
zeus-ui 的 `@zeus-web/headless` 是对已发布 primitives 的再导出。

### 4.2 三个可选方案

| 方案                                      | 动作                             | 代价                                                                         |
| ----------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| A. 改名为 `@zeus-ui/headless` 保留        | 迁入 zeus-ui 但保持 scope 与名字 | scope 分裂（`@zeus-ui` 与 `@zeus-web` 并存）；但它 private，不发布           |
| B. 改名为 `@zeus-web/headless-legacy`     | 迁入并重命名                     | 与现有 `@zeus-web/headless` 语义冲突更严重                                   |
| C. **不迁，在 zeus 内标注为内部 fixture** | 保留在原处                       | 5 个消费者也留在 zeus，但它们依赖 `@zeus-ui` scope，与「zeus 不依赖 UI」冲突 |

**Phase 1 建议 A**：它是 private 包，不发布，不会污染 npm。
迁入后 `@zeus-ui` 成为 zeus-ui 仓库内的第二个私有 scope，需在 AGENTS.md 登记。
**这需要你确认（D-05）。**

### 4.3 迁移顺序（依赖决定）

```
1. @zeus-ui/headless          （无内部依赖，但依赖 8 个 @zeus-js workspace 包）
2. headless-demo              （依赖 1）  ← 必须先补声明！
3. registry-react / registry-vue      （依赖 1）
4. use-headless-cli / react / vue     （依赖 1）
```

**前置修复**：`headless-demo` 的 `package.json` 未声明 `@zeus-ui/headless`，
但 `src/main.tsx:1-2` 导入了它。迁移前必须先补上声明，否则独立安装会失败。

---

## 5. 兼容矩阵（迁移后目标状态）

| 消费者                 | 框架版本                  | UI 版本         | 状态             | 验证方式                   |
| ---------------------- | ------------------------- | --------------- | ---------------- | -------------------------- |
| zeus 自身 examples     | `0.2.0-rc.3`（workspace） | 无              | workspace        | `examples:check`           |
| zeus-ui 包（46）       | `0.1.1-beta.20`（pin）    | 自身 workspace  | published_pinned | `release:verify`           |
| zeus-ui examples（14） | 无                        | workspace       | local_only       | `showcase:ci`              |
| ecosystem/admin        | `0.2.0-rc.3`              | `0.1.0-beta.35` | **待验证**       | `check:admin` 拆分后的三套 |
| ecosystem/ai-workbench | `0.2.0-rc.3`              | `0.1.0-beta.35` | **待验证**       | 7 个 gate                  |
| zeus/playground-editor | `0.2.0-rc.3`（workspace） | 无              | workspace        | 6 个 Playwright 门禁       |

**关键顺序问题**：zeus-ui 的 46 个包仍 pin `0.1.1-beta.20`。
若 P1 发布了 `0.2.0`，zeus-ui 是否需要同步升级？
**答案：不强制。** 设计包 `docs/03:75` 明确「不要求每次 Zeus 发布都强制发布 Zeus UI」。
但迁移后的 ecosystem 需要 `0.2.0`（admin 用新 Router API），而 zeus-ui 仍是 `0.1.1-beta.20`——
**这意味着 ecosystem 会同时依赖两个不同大版本的 `@zeus-js/*`**（admin 用 0.2，UI 包传递依赖 0.1.1）。

这是一个**真实的版本冲突风险**，见 `06-sequencing-and-rollback.md` 的 R-V1。

---

## 6. 依赖迁移的验收条件

| ID    | 条件                                                 | 检查命令                                                     |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| AC-01 | 无跨仓 `workspace:*`                                 | `grep -r "workspace:" ecosystem/**/package.json` 无命中      |
| AC-02 | 无 `file:` / `link:` 依赖                            | `grep -rE '"file:\|"link:' ecosystem/**/package.json` 无命中 |
| AC-03 | 无 git/相对路径依赖                                  | `grep -rE 'git\+                                             | \.\./' ecosystem/\*\*/package.json` 无命中 |
| AC-04 | 独立版本线未被误写                                   | 人工核对 `vite-plugin`、`devtools-consumer`、`create-zeus`   |
| AC-05 | vendor 已删除且无引用                                | `grep -r "vendor/zeus-web-dialog" ecosystem` 无命中          |
| AC-06 | 无 `@zeus-ui` scope 泄漏到 ecosystem                 | `grep -r "@zeus-ui/" ecosystem` 无命中                       |
| AC-07 | 每个应用的 `pnpm install --frozen-lockfile` 独立通过 | 逐应用执行                                                   |

**AC-07 是最强的一条**：它同时验证了「无隐藏的 workspace 依赖」与「lockfile 完整」。
Phase 0 已发现 `headless-demo` 在严格安装下会失败的先例（R-17）。
