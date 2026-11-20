# R19 — 根目录治理审计（Phase 0）

基线 `cc9a8254`。本文件记录**实际测量到的**事实，不是设计意图。
每条结论后面注明取证方式；未取证的写"未验证"，不写"应该没问题"。

---

## 1. 测量方法

| 取证方式                                        | 用途                                 |
| ----------------------------------------------- | ------------------------------------ |
| `git ls-files <dir> \| wc -l`                   | 受版本控制文件数（排除生成物）       |
| `git ls-files \| awk -F/ '{print $1}'`          | 根级条目全集，避免 `ls` 被忽略项误导 |
| `grep -rn` 覆盖 `.ts/.mjs/.yml/.json/.toml/.md` | 文本引用                             |
| `git grep -ln -- ':!<dir>/*'`                   | 排除自身目录内的自引用               |
| `node -e` 解析 `package.json`                   | 脚本里的路径，避免正则误匹配         |

**已知陷阱（本次全部踩过一遍）：**

1. `git grep artifacts` 会匹配到 `native-artifacts`、`release-artifacts`、
   `actions/artifacts` 这些**同名词**。必须锚定 `artifacts/` 且排除前后缀。
2. `package.json` 里有 200 条 `scripts/...` 路径。用宽正则会把整个
   `scripts/` 目录当成"被引用"，从而漏掉真正要查的目录。
3. `examples/admin/deploy/` 与根级 `deploy/` 同名不同物。`temp/deploy/`
   是 CI 生成物。三者混在一起统计会得出错误结论。

---

## 2. 根目录矩阵

`temp/`、`target/`、`node_modules/` 是忽略项（`temp` 已有 104 MB 磁盘占用、
0 个受控文件），不计入下表。

| 路径               | 用途                   | 文件 | 磁盘  | 实际引用者                                                                            | 工具约束                                         | 可移动性         | 建议                           |
| ------------------ | ---------------------- | ---- | ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------- | ------------------------------ |
| `artifacts/`       | 设计验收截图证据       | 64   | 4.5 M | **无**（仅自身 `review.md`）                                                          | 无                                               | **高**           | 迁入 `docs/acceptance/design/` |
| `benchmarks/`      | component-host 基准    | 24   | 628 K | pnpm workspace、tsconfig、CI path filter、`scripts/bench/*`                           | `pnpm-workspace.yaml` glob、`tsconfig.json` glob | **低**           | 保留                           |
| `crates/`          | Rust 编译器            | 76   | 888 K | Cargo workspace、两个 Dockerfile、CI                                                  | Cargo 根配置                                     | **禁止**         | 保留                           |
| `deploy/`          | 宿主机部署输入         | 5    | 24 K  | `deployment-stage1.ts`、`deployment-stage2.ts`、`deployment-layout.ts`、2 个 workflow | 路径安全校验强制前缀                             | **禁止**         | 保留                           |
| `docs/`            | 文档站                 | 444  | 25 M  | VitePress、`check-docs.ts`、多处注释                                                  | VitePress `srcExclude`                           | 中（内部可整理） | 整理内部                       |
| `examples/`        | 示例与产品             | 278  | 134 M | pnpm workspace、Dockerfile、大量脚本                                                  | 多处                                             | **禁止**         | 保留                           |
| `packages/`        | 六域包                 | 668  | 14 M  | 全部                                                                                  | 发布组、`check:structure`                        | **禁止**         | 保留                           |
| `release-pairing/` | 发布配对记录           | 5    | 24 K  | `pair-attestation.ts` 常量、`check-release-pairing.ts`、`release.yml` ×3              | 路径字符串硬编码                                 | **禁止**         | 保留                           |
| `release-policy/`  | 发布策略输入           | 1    | 8 K   | `historical-latest.ts` 常量 + 测试断言                                                | 路径字符串硬编码                                 | **禁止**         | 保留                           |
| `scripts/`         | 工具链                 | 327  | 3.7 M | 全部                                                                                  | 入口                                             | 中（内部可整理） | 保留                           |
| `tests/`           | golden components 契约 | 1    | 40 K  | `check-golden-components.ts:31`、`golden-component-fixtures.spec.ts:17`               | 路径字符串                                       | **低**           | 保留                           |
| `vendor/`          | 固定构建产物           | 70   | 584 K | pnpm `file:` 依赖、两个 ignore 文件的例外规则、Admin Dockerfile                       | provenance 校验                                  | **禁止**         | 保留                           |

---

## 3. 重点目录逐个结论

### 3.1 `artifacts/` — 唯一确定可安全迁移的目录

```
artifacts/design-acceptance/
├── review.md            唯一的文字说明
├── diff/                11 张对比图
└── implementation/      53 张实现截图（admin / web / ...）
```

- **零 CI 引用**：`.github/workflows/` 里没有任何 `artifacts/` 路径。
- **零代码引用**：`scripts/**/*.ts` 里没有 `artifacts/` 常量或字符串。
- **零配置引用**：不在 `pnpm-workspace.yaml`、`tsconfig.json`、`vitest.config.ts` 中。
- **唯一引用**是 `artifacts/design-acceptance/review.md:8` 的自我描述。

`docs/acceptance/` 已存在两个同类目录
（`cross-repo-contract-2026-11-02/`、`pr-c-2026-11-13/`），命名惯例一致。
**迁移是安全的，且符合既有约定。**

### 3.2 `deploy/` — 不可移动

`deploy/host-validation/` 是生产部署的真实输入：

- `scripts/release/deployment-stage1.ts:50,212` 读 `deploy/host-validation/compose.yml`
- `.github/workflows/host-deployment-stage2.yml:62,171` 默认值和环境变量都指向它
- `scripts/release/deployment-layout.ts:123` 用 `path.join(root, 'deploy')`
  做前缀安全校验，测试断言"`must live under the repository deploy/`"

最后一条是硬约束：**目录名本身参与安全校验**，改名等于改安全策略。

### 3.3 `release-pairing/` / `release-policy/` — 不可移动

两者都是发布链路的运行时输入，路径写死：

- `scripts/release/pair-attestation.ts:43`
  → `PAIR_ATTESTATION_DIRECTORY = 'release-pairing/attestations'`
- `scripts/release/historical-latest.ts:49`
  → `HISTORICAL_LATEST_PATH = 'release-policy/historical-latest.json'`
- `.github/workflows/release.yml:101,218,312` 三处引用
  `release-pairing/v${{ ... }}.json`
- `scripts/release/write-pair-attestation.ts:164` 通过 GitHub contents API
  按 `repos/${repository}/contents/release-pairing/v${version}.json` 取文件
  —— **远端路径**，改本地目录而不同步这里会直接断链。
- `historical-latest.spec.ts:1087` 是**断言常量值**的测试，
  改路径必须同时改测试，否则测试会失败（这是好事，但它证明了强耦合）。

### 3.4 `vendor/` — 不可移动，且移动会破坏忽略规则

```gitignore
dist
!vendor/zeus-web-dialog/dist/     # 必须在 dist 之后
```

```dockerignore
**/dist
!vendor/zeus-web-dialog/dist      # 同一顺序陷阱
```

`.gitignore:20` 和 `.dockerignore:9` 的注释都明确记录了"规则顺序写反导致
vendored 包只进 manifest 不进代码"的历史事故。移动 `vendor/` 需要同时改
两个 ignore 文件、`pnpm-lock.yaml` 的 `file:` 解析、Admin Dockerfile 的
`COPY vendor ./vendor`，以及 `provenance.json` 的校验路径。

### 3.5 `benchmarks/` — 移动成本高于收益

被四处工具配置绑定：`pnpm-workspace.yaml:9` (`benchmarks/*`)、
`tsconfig.json` (`benchmarks/*/src`)、CI path filter
(`component-host-bench.yml` ×2)、`scripts/bench/component-host-config.ts:6-7`。

它不是"杂项"，是 component-host 基准的固定工作区成员。

---

## 4. 审计中发现的真实缺陷

### 4.1 `tsconfig.json` 有指向不存在目录的 glob

```json
"include": [ ..., "create/*/src", "create/*/__tests__", ... ]
```

根目录没有 `create/`。这是 R16.0 把 `create` 域移进
`packages/create/` 后遗留的。

- `create/*/src` → 0 个匹配
- `create/*/__tests__` → 0 个匹配
- `tsconfig.build.json` 里已有正确的 `packages/create/...` 条目

**零匹配意味着零作用**，但会让读配置的人以为根下有 `create/` 目录。
这是配置腐坏，不是风格问题。（修复见 Phase 4）

### 4.2 `current-pipeline.md` 名不副实

`docs/architecture/compiler/current-pipeline.md` 标题是
"Current Compiler Pipeline"，但正文第一句是：

> The state of `crates/zeus_compiler` **before R17.0**, measured at `649e2f60`.

正文包含 `lower.rs:2924`、`lower.rs:395` 等行号，以及
"`Lowerer::new(...)` ← the lowering God Object" 的说法。
R18.2 已经把 `Lowerer` 拆成 `LoweringContext` + `LoweringState`，
R18.3 又把 HMR/Hydration 移出了 `codegen`。**这些行号全部失效。**

任何人（或 agent）把它当现行文档读，会得到错误的模块结构。
（修复见 Phase 1）

### 4.3 `docs/` 顶层散落 16 个文件，其中 10 个是 CI 历史报告

顶层 16 个 `.md`（不含 `index.md`、`package.json`）：

- **10 个 CI 报告**：`ci-optimization-{baseline,phase1,phase2,phase3-report,phase3a,phase3b,phase3c,report}.md`、`ci-native-matrix-dedup-rfc.md`、`ci-wasm-parity-gallery-conflict.md`
- 2 个 Admin 缺陷调查
- `baseline-2026-10.md`、`golden-components-contract.md`、
  `playground-execution-budget.md`、`release-process.md`

其中 `release-process.md` 和 `golden-components-contract.md` 是**现行规范**，
不能与历史报告混在一起处理。

**作为 CI fixture 的文件**（不能只按文档类型搬）：

| 文件                            | 引用者                                                                                               | 性质                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `ci-native-matrix-dedup-rfc.md` | `.github/workflows/compiler-native.yml:22`、`scripts/release/__tests__/release-workflow.spec.ts:547` | 两处都是**注释引用**，不断言文件存在 |
| `ci-optimization-baseline.md`   | `.github/workflows/ci.yml:10,174`                                                                    | 同上，注释引用                       |

两处都是注释而非读取，迁移时同步改注释即可。但**必须先改注释再移动**，
否则会留下指向空路径的注释——这正是 R16.0 留下的那类问题。

---

## 5. 根级配置与工具约束（不可动清单）

| 文件                                   | 约束                                                |
| -------------------------------------- | --------------------------------------------------- |
| `Cargo.toml`                           | workspace members 三条路径，改则 Cargo 找不到 crate |
| `pnpm-workspace.yaml`                  | 9 条 glob，含 `docs`、`benchmarks/*`、`examples/*`  |
| `tsconfig.json`                        | 28 条 include glob                                  |
| `eslint.config.js`                     | `vendor/**` 在 ignore 列表                          |
| `.gitignore` / `.dockerignore`         | 例外规则顺序敏感（见 3.4）                          |
| `rust-toolchain.toml` / `rustfmt.toml` | 工具链固定                                          |
| `skills-lock.json`                     | Agent 配置                                          |
| `.ncurc.json` / `.node-version`        | 依赖与 Node 版本                                    |
| `.changeset/`                          | 版本管理                                            |
| `.agents/`                             | Agent 规则与 skills，多处引用根目录路径             |

---

## 6. Phase 1 的迁移范围（本次实际执行）

基于以上审计，**本次只迁移证据确凿的两类**：

### 6.1 `artifacts/design-acceptance/` → `docs/acceptance/design/`

理由：零外部引用、`docs/acceptance/` 已有同类先例、4.5 MB 截图不该占据根目录。
同步修改 `review.md` 内部的相对描述。

### 6.2 `docs/ci-*.md`（10 个历史 CI 报告）→ `docs/ci/`

理由：顶层混入历史报告，与现行规范无法区分。
**先修注释引用，再移动文件**，避免产生新的悬空路径。
不迁 `release-process.md`、`golden-components-contract.md` 等现行规范。

### 6.3 明确 `current-pipeline.md` 的历史地位，并建立现行入口

- 把它改名为 `r17-baseline-pipeline.md` 或在文件开头加醒目的历史快照标记
- 新建 `docs/architecture/compiler/pipeline.md` 作为**现行**入口，
  内容对照 `cc9a8254` 的真实模块结构，不含行号（行号会腐坏）

---

## 7. 本次不做的（及原因）

| 项目                                       | 原因                           |
| ------------------------------------------ | ------------------------------ |
| 移动 `benchmarks/`                         | 四处工具配置绑定，收益不抵风险 |
| 移动 `deploy/`                             | 目录名参与安全校验             |
| 移动 `release-pairing/`、`release-policy/` | 路径常量 + 远端 API 路径       |
| 移动 `vendor/`                             | 忽略规则顺序陷阱，见 3.4       |
| 合并 `scripts/` 子目录                     | 327 文件，Phase 3 只审入口不搬 |
| 删除 `artifacts/` 历史截图                 | 证据保留，只换位置             |

---

## 8. 未验证项

- `tests/` 已在本次审计中确认：`tests/contracts/golden-components.json` 被
  `scripts/check/check-golden-components.ts:31` 与
  `scripts/check/__tests__/golden-component-fixtures.spec.ts:17` 按路径读取。
  **它不可删除、不可移动**（此前标记为"未验证"，现已取证）。
- `docs/` 内部还有 157 个 `internal/` 文件、55 个 `release/` 文件，
  本次不逐个甄别其历史/现行属性，只处理顶层。
- VitePress 构建后的路由是否因迁移产生 404，需
  `pnpm check:docs` 与 `docs:build` 实际运行确认（见交付记录）。
