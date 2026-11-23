# 依赖拓扑：包级与应用级

## 1. 目标形态与实际形态的差距

设计包的目标是单向三仓（`zeus` → `zeus-ui` → `zeus-ecosystem`）。实际拓扑有 **5 条反向边**，
其中 2 条是设计包未识别的。

```
                    ┌─────────────────────────────────────┐
                    │  zeus (38 包 + 6 模板 + 21 examples) │
                    └──────────────┬──────────────────────┘
                                   │ 发布 @zeus-js/* 0.1.1-beta.20 / 0.2.0-rc.3(未发布)
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  zeus-ui (46 包 + 16 examples + docs)│
                    └──────────────┬──────────────────────┘
                                   │ 发布 @zeus-web/* 0.1.0-beta.34(beta.35 未发布)
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  (尚未存在) zeus-ecosystem           │
                    └─────────────────────────────────────┘

反向边（实际存在）：
  ① zeus/examples/admin        --@zeus-web/* 25 个-->  zeus-ui 发布物
  ② zeus/create-zeus 模板      --@zeus-web/button-->   zeus-ui 发布物   ← 设计包未识别
  ③ zeus/scripts/release/*     --读 manifest/tag-->    zeus-ui 仓库     ← 设计包未识别
  ④ zeus/5 个工作流            --checkout zeus-ui-->   zeus-ui 仓库
  ⑤ zeus-ui/examples/ai-workbench --@zeus-js/* 3 个--> zeus 发布物（0.1.1-beta.20）
```

**边 ⑤ 是设计包认可的（`zeus-ui` 消费已发布 `@zeus-js/*`），但注意它只在 `ai-workbench` 一处成立**——
`zeus-ui` 的 46 个包里，30 个声明 `@zeus-js/*` 依赖；16 个 examples 里只有 1 个直接声明。

---

## 2. 包级拓扑

### 2.1 `zeus` — 38 个可发布包 + 6 个模板

按领域（`scripts/check/check-structure.ts:33-83` 的权威清单）：

| 领域       | 数量 | 包                                                                                                                       | 版本                                                               |
| ---------- | ---: | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `core`     |    5 | shared、signal、runtime-dom、runtime-ssr、zeus                                                                           | `0.2.0-rc.3`                                                       |
| `compiler` |   11 | compiler、compiler-shared、compiler-native、compiler-wasm、7 个平台包                                                    | `0.2.0-rc.3`（compiler-wasm 为 `0.1.1-beta.20` + `private: true`） |
| `features` |    4 | router、resource、query、i18n                                                                                            | `0.2.0-rc.3`                                                       |
| `web-c`    |   10 | web-c、web-c-runtime、component-analyzer、component-dts、bundler-plugin、output-{wc,css,icons,react-wrapper,vue-wrapper} | `0.2.0-rc.3`                                                       |
| `tooling`  |    5 | vite-plugin（`0.0.5`）、eslint-plugin、testing、playground-engine、consumer（`0.1.1-beta.14` + private）                 | 混合                                                               |
| `create`   |    3 | create-zeus（`0.1.5`）、zeus-ui（`0.0.1`）、@zeus-ui/registry（`0.0.1`）                                                 | 独立版本线                                                         |
| 模板       |    6 | basic-ts、application-ts、admin-ts、web-component-ts、component-library-ts、webc-consumer-ts                             | `0.0.0`，private                                                   |

**版本线**：不是统一版本。`core`/`features`/`web-c` 走 `0.2.0-rc.3`；`vite-plugin` 独立 `0.0.5`；
`create-zeus` 独立 `0.1.5`；`compiler-wasm` 与 `devtools-consumer` 停在 `0.1.1-beta.x`。
这与 AGENTS.md §4.8 的「32 包固定发布组 + 8 包 Native 组 + 3 条独立版本线」一致。

**`zeus` 对 `@zeus-web/*` 的依赖面**：38 个包中只有 1 处命中，来自模板（见边 ②）。

### 2.2 `zeus-ui` — 46 个可发布包

全部 `0.1.0-beta.35`，全部 `publishConfig.access = public`，全部 `provenance: true`，**单一版本线**（`scripts/release.config.ts:8` `workspace-fixed`）。

| 分组        | 数量 | 说明                                                                                                 |
| ----------- | ---: | ---------------------------------------------------------------------------------------------------- |
| primitives  |   24 | 全部声明 5 个 `@zeus-js/*@0.1.1-beta.20`（4 个 dependencies + `zeus` peer）+ `@zeus-web/zeus-compat` |
| advanced    |    5 | agent-console、chat、data-grid、revogrid-adapter、virtual；同上依赖形状                              |
| ai          |    7 | ai、ai-core、ai-primitives、ai-adapters、ai-react、ai-vue、ai-wc；**0 个 `@zeus-js/*`**              |
| 聚合入口    |    4 | headless、react、vue、ui；**0 个 `@zeus-js/*`**（靠成员包下沉）                                      |
| 工具/元数据 |    6 | cli、registry、themes、utils、icons（依赖 `output-icons`）、zeus-compat（peer `zeus`）               |

**关键发现 1：`zeus-compat` 是全部 29 个组件包的共同底座。**
`packages/zeus-compat/src/index.ts` 原样再导出 `@zeus-js/zeus` 的 15 个公共 API
（`For/Host/Show/Slot/batch/createContext/createEffect/...`）。它是框架边界的唯一切口。

**关键发现 2：30 个包把 `@zeus-js/output-*` 声明为 `dependencies`，不是 `devDependencies`。**
`output-react-wrapper`、`output-vue-wrapper` 按命名应是构建期代码生成工具，却进入了运行时依赖树。
是否真的被 runtime import 未验证（`02` 范围内 UNKNOWN）。这会影响发布物体积与 SBOM 组成。

### 2.3 跨仓版本契约

| 方向                                     | 声明位置                                      | 版本                                  | 状态                   |
| ---------------------------------------- | --------------------------------------------- | ------------------------------------- | ---------------------- |
| `zeus-ui` → `zeus`                       | 30 个包的 deps/peer                           | `0.1.1-beta.20`                       | **精确 pin，无 range** |
| `zeus/examples/admin` → `zeus-ui`        | `examples/admin/package.json:20-44`           | `0.1.0-beta.34`                       | 精确 pin（24 个）      |
| `zeus/examples/admin` → `vendor`         | 同文件 `:29`                                  | `file:../../vendor/zeus-web-dialog`   | 本地路径               |
| `zeus/create-zeus` 模板 → `zeus-ui`      | `templates/webc-consumer-ts/package.json:13`  | `0.1.0-beta.34`                       | 精确 pin               |
| `zeus-ui/examples/ai-workbench` → `zeus` | `examples/ai-workbench/package.json:12,13,20` | `0.1.1-beta.20` + `vite-plugin 0.0.5` | 精确 pin               |

**没有一条使用 range（`^`/`~`）或 `workspace:*` 跨仓**。设计包 `docs/03-dependency-release-contract.md:44`
要求「Beta 阶段固定明确的 prerelease 版本」——**现状已满足**。

### 2.4 vendor 特例

`vendor/zeus-web-dialog/provenance.json`：

| 字段          | 值                                                                                |
| ------------- | --------------------------------------------------------------------------------- |
| schema        | `zeus-web.vendored-build/v1`                                                      |
| version       | `0.1.0-beta.35`                                                                   |
| commit        | `74662b614e209e38a7b2b4557aa28df01141be25`                                        |
| contentDigest | `sha256:30f23d06...`                                                              |
| rewrites      | `@zeus-web/zeus-compat: workspace:* → 0.1.0-beta.34`                              |
| note          | 「Vendored so Admin can consume a version npm does not have yet. Not published.」 |

**删除门槛**（设计包 `docs/03-dependency-release-pact.md:87-95` 已给出，此处补上实测状态）：

| 条件                               | 当前状态                                                      |
| ---------------------------------- | ------------------------------------------------------------- |
| 上游正式包已包含所需能力           | **不满足**：registry 最新 `beta.34`，vendor 是 `beta.35` 构建 |
| vendor 功能有明确替代              | 不满足（同上）                                                |
| 替代版本通过类型检查/构建/行为测试 | 未验证                                                        |
| 生产 Demo 与 E2E 不再引用 vendor   | 不满足：`examples/admin/package.json:29` 仍为 `file:`         |
| SBOM 中 vendor 记录按预期消失      | 未验证                                                        |
| 回滚方案存在                       | 未定义                                                        |

**结论：vendor 现在不能删。** 前置条件是发布 `@zeus-web/*@0.1.0-beta.35`（或更高）并验证 dialog 修复。

---

## 3. 应用级拓扑

### 3.1 `zeus` 的 examples 内部依赖

```
@zeus-ui/headless (examples/headless, private)
   ├── examples/headless-demo        (workspace:*)  ← 未声明？
   ├── examples/registry-react       (workspace:*)
   ├── examples/registry-vue         (workspace:*)
   ├── examples/use-headless-cli     (workspace:*)
   ├── examples/use-headless-react   (workspace:*)
   └── examples/use-headless-vue     (workspace:*)
```

**这是 examples 内部唯一的二级依赖中心**。迁移时 `headless` 必须先于这 5 个示例。

注意 `headless-demo` 的 `import '@zeus-ui/headless/wc'` 与其 `package.json` **不一致**：
源码导入但未在依赖中声明（依赖列表只有 3 个 `@zeus-js/*`）。本地靠 pnpm 提升通过，严格安装会失败。

### 3.2 `zeus-ui` 的 examples 内部依赖

```
showcase-shared (examples/showcase-shared)
   ├── react-showcase      (23 个 @zeus-web)
   ├── vue-showcase        (23 个 @zeus-web)
   └── e2e/showcase/utils/routes.ts  ← 直接 import 源码，不是包消费
```

`showcase-shared` 的 `exports` 直接指向 `src/index.ts`，无构建步骤。这是**源码级耦合**，
不是包级依赖——迁移或拆分时不能按包依赖图分析。

### 3.3 应用 → 包 的消费矩阵

| 应用                        | `@zeus-js/*`                                     | `@zeus-web/*`             | 路由                     | 服务端                  | 持久化                     |
| --------------------------- | ------------------------------------------------ | ------------------------- | ------------------------ | ----------------------- | -------------------------- |
| `zeus/admin`                | zeus, router, query, resource, i18n（workspace） | 25（24 pin + 1 file）     | `@zeus-js/router`        | node:http + node:sqlite | SQLite 文件 + localStorage |
| `zeus/playground-editor`    | 9（含 compiler-wasm、playground-engine）         | **0**                     | 无（单页多入口）         | **无**（纯静态）        | IndexedDB                  |
| `zeus-ui/ai-workbench`      | zeus, runtime-dom, vite-plugin                   | 4（ai-\*）                | 无                       | 经 `/ai-host/` 代理     | IndexedDB（vault）+ SSE    |
| `zeus-ui/ai-host`           | 0                                                | 2（ai-core、ai-adapters） | 无                       | node:http + node:sqlite | SQLite 事件日志            |
| `zeus-ui/react-showcase`    | 0                                                | 23                        | `@tanstack/react-router` | 无                      | 无                         |
| `zeus-ui/vue-showcase`      | 0                                                | 23                        | `vue-router`             | 无                      | 无                         |
| `zeus-ui/advanced-showcase` | 0                                                | 5                         | `react-router-dom`       | 无                      | 无                         |
| `zeus-ui/apps/docs`         | 0                                                | 31                        | VitePress 内建           | 无                      | 无                         |

### 3.4 隐藏的源码耦合

| 耦合                                      | 位置                                                                                | 影响                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| 检查脚本 import admin 服务端              | `scripts/check/check-admin.ts:16-17`；`scripts/release/deployment-acceptance.ts:39` | 搬 admin 会同时打断 zeus 的 check 与 release |
| 检查脚本读 admin `node_modules`           | `scripts/check/verify-vendored-dialog.ts:5,35`                                      | vendor 路径硬编码                            |
| vitest 把 admin server 测试并入根 project | `vitest.config.ts:13`                                                               | 搬 admin 会静默减少根测试覆盖                |
| CI 影响分析按 `examples/admin/` 路径分类  | `scripts/ci/impact-analysis.ts:120-121`                                             | 搬走后影响分析失去该分类                     |
| zeus-ui 检查脚本跨目录 import examples    | `scripts/checks/examples/*.ts` → `examples/showcase-shared/src`                     | 拆 examples 需同步改检查脚本                 |

---

## 4. 依赖方向的结论

1. **包级反向依赖只有 2 处**：`examples/admin` 与 `create-zeus` 模板。前者是应用，后者是产品。
   后者更严重，因为它会发布给用户。
2. **工具链反向依赖有 1 类**：`scripts/release/*` 直接读 zeus-ui 的 manifest 与 tag（`ui-sources.ts`、`rc-manifest.ts`、
   `rc-dry-run.ts`、`candidate-pair.ts`、`ui-attestation.ts`）。这不是源码依赖，但拆仓后需要改成读发布的包元数据。
3. **工作流反向依赖有 5 处**：见 `04-workflow-deployment-map.md`。其中 `demos-pages` 依赖 zeus-ui 公开可匿名克隆。
4. **`zeus-ui` 对 `zeus` 的依赖是干净的**：30 个包精确 pin `0.1.1-beta.20`，无 `file:`、无 git、无 workspace 跨仓。
   这一点设计包判断正确。
5. **`@zeus-ui` scope 归属混乱**：`zeus/examples/headless`（private）与 `zeus/packages/create/registry`（可发布）
   都占用 `@zeus-ui`。拆仓后需要明确该 scope 归谁。

## 5. UNKNOWN

- `@zeus-js/output-*` 是否被运行时 import（影响 30 个发布包的依赖树与体积）
- `zeus-ui/temp/ai-pack-report.json` 等 86 个临时目录是否仍被 CI 依赖（已知 `joint-readiness.ts:361` 读 1 个）
- `zeus` 的 `release-pairing` 读取端是否同时识别 `meta/release/pairing/` 与旧路径（AGENTS.md 声称是，未逐行验证）
