# R25 根目录架构收敛（meta/ + benchmarks 迁移）

基线 `290a0cb3`（main），分支 `claude/zeus-root-structure-cleanup-11004b`。

**每一项只写四种结论之一：VERIFIED / PARTIAL / BLOCKED_ENV / NOT_RUN。**
未执行的不写"应该没问题"。

---

## 1. 根目录 Before / After

| 项目                 | Before（`290a0cb3`）                                                                                                                                                 | After                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 受版本控制的根目录数 | 15                                                                                                                                                                   | 10                                                                                                                  |
| 根目录全集（受控）   | `.agents` `.changeset` `.github` `.vscode` `benchmarks` `crates` `deploy` `docs` `examples` `packages` `release-pairing` `release-policy` `scripts` `tests` `vendor` | `.agents` `.changeset` `.github` `.vscode` `crates` `deploy` `docs` `examples` `meta` `packages` `scripts` `vendor` |

减少的五个条目：`release-pairing/`、`release-policy/`、`tests/`、`benchmarks/`
被移走，`meta/` 新增。`crates/` 与 `deploy/` 按要求保留（见 §5）。

```text
zeus/
├── packages/          （未动）
├── crates/            （未动，Rust workspace）
├── examples/          （未动）
├── scripts/
│   └── bench/
│       └── fixtures/
│           └── component-host/   ← 原 benchmarks/component-host
├── deploy/            （未动）
├── docs/              （未动）
├── meta/
│   ├── release/
│   │   ├── pairing/
│   │   │   ├── README.md
│   │   │   └── v0.2.0-rc.{0,1,2,3}.json
│   │   └── historical-latest.json
│   └── contracts/
│       └── golden-components.json
└── vendor/            （未动，见 §4）
```

**VERIFIED** — `git ls-tree -d --name-only 290a0cb3` 与 `HEAD` 对照，见上表。

---

## 2. 实际迁移文件清单

全部 `git mv`，`git diff --name-status` 显示为 `R100`（除 README 与 fixture 的
`tsconfig.json` 为 `R092` / `RM`，因内部路径与说明需要改写 —— 业务数据未动）。

| 原路径                                      | 目标路径                                   | 状态                          |
| ------------------------------------------- | ------------------------------------------ | ----------------------------- |
| `release-pairing/README.md`                 | `meta/release/pairing/README.md`           | R092                          |
| `release-pairing/v0.2.0-rc.0.json`          | `meta/release/pairing/v0.2.0-rc.0.json`    | R100                          |
| `release-pairing/v0.2.0-rc.1.json`          | `meta/release/pairing/v0.2.0-rc.1.json`    | R100                          |
| `release-pairing/v0.2.0-rc.2.json`          | `meta/release/pairing/v0.2.0-rc.2.json`    | R100                          |
| `release-pairing/v0.2.0-rc.3.json`          | `meta/release/pairing/v0.2.0-rc.3.json`    | R100                          |
| `release-policy/historical-latest.json`     | `meta/release/historical-latest.json`      | R100                          |
| `tests/contracts/golden-components.json`    | `meta/contracts/golden-components.json`    | R100                          |
| `benchmarks/component-host/**`（24 个文件） | `scripts/bench/fixtures/component-host/**` | R100（`tsconfig.json` 为 RM） |

### 数据未改动的证据

| 文件                                    | 迁移后 sha256（前 16 位） | main 上同内容文件 |
| --------------------------------------- | ------------------------- | ----------------- |
| `meta/release/pairing/v0.2.0-rc.0.json` | `6c7a296c9ac56811`        | 相同              |
| `meta/release/historical-latest.json`   | `2cf642753742d2b2`        | 相同              |
| `meta/contracts/golden-components.json` | `57c481c4bf9a229e`        | 相同              |

schema、版本号、SHA、时间戳、`firstPublish`、`recovery` 块、`contentDigest`
与原始发布证据全部逐字节保留。

---

## 3. 完整路径引用修复清单

### A. 执行时路径（必须改，已改）

| 文件                                                                | 改动                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `scripts/release/pair-attestation.ts`                               | `PAIR_ATTESTATION_DIRECTORY` → `meta/release/pairing/attestations`；新增 `TAGGED_RECORD_PATHS` |
| `scripts/release/release-pairing.ts`                                | 模块头注释中的路径                                                                             |
| `scripts/release/historical-latest.ts`                              | `HISTORICAL_LATEST_PATH` → `meta/release/historical-latest.json`                               |
| `scripts/release/write-pair-attestation.ts`                         | 标签树双路径读取；`--out` 根推导改为 `rootOfAttestationFile`                                   |
| `scripts/check/check-release-pairing.ts`                            | 记录目录与 attestations 目录                                                                   |
| `scripts/check/check-golden-components.ts`                          | 契约路径                                                                                       |
| `scripts/release/drill-rc-recovery.ts`、`simulate-first-release.ts` | 用法注释中的 `--pairing-record` 示例路径                                                       |
| `.github/workflows/release.yml`（3 处）                             | `FILE=` 与两处 `--pairing-record`                                                              |
| `scripts/bench/component-host-config.ts`                            | `root` / `dist`（唯二读取点）                                                                  |
| `scripts/shared/utils.ts`                                           | `scanRoot('scripts/bench/fixtures')`                                                           |
| `scripts/ci/impact-analysis.ts`                                     | `benchmarks/` 规则 → `scripts/bench/fixtures/`；parity 注释                                    |
| `pnpm-workspace.yaml`                                               | workspace glob                                                                                 |
| `tsconfig.json`                                                     | 两条 include glob                                                                              |
| `scripts/bench/fixtures/component-host/tsconfig.json`               | 4 条 `../../` → `../../../../`                                                                 |
| `.github/workflows/component-host-bench.yml`（2 处）                | path filters                                                                                   |
| `pnpm-lock.yaml`                                                    | importer 键与 `link:` 相对层级                                                                 |
| `packages/compiler/compiler-wasm/__tests__/parity.test.mjs`         | corpus 根改为 `scripts/bench/fixtures`，并新增逐根非空断言                                     |

### B. 当前有效的配置与文档（已改）

| 文件                                    | 改动                                                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` §6                          | 强制边界改为 `meta/release/pairing/`、`meta/release/historical-latest.json`、`meta/contracts/`，并说明标签读取兼容不是旧目录复活 |
| `docs/release-process.md`               | §5.4.1 基线路径；§2 workspace glob 列表                                                                                          |
| `docs/golden-components-contract.md`    | 冻结 API 路径                                                                                                                    |
| `scripts/check/check-root-structure.ts` | 允许目录、pinned 目录、`MIGRATED_TO_META`、`REQUIRED_META_PATHS`                                                                 |

### C. 历史记录（保留，不改）

`docs/release/` 下 20 份、`docs/internal/` 下 6 份、`docs/architecture/r16|r19|r20` 5 份
dated 审计/事故/证据文件全部保留原样。逐文件分类见本轮审计记录（32 处路径提及，
0 处活链接指向已迁移文件）。

**未做全局字符串替换的原因：** `zeus.release-pairing/v1`、`zeus.release-policy/v2`、
`zeus-ui.release-pairing/v1` 是 JSON 内的 **schema 标识**，不是路径；
`check:release-pairing` 是 **npm script 名**；`'../release-pairing'` 是 **模块名**。
一次性替换会同时破坏这四类。

**VERIFIED** — 全仓 `grep` 覆盖 `.ts/.tsx/.mjs/.js/.json/.yml/.yaml/.toml/.md/Dockerfile`，
残留命中仅为上述四类与守卫表本身。

---

## 4. Vendor 最终处理结果：保留，未迁移

**结论：`vendor/zeus-web-dialog/` 原地保留。不建议迁移到 `examples/admin/vendor/`，
更不能删除。**

### 4.1 为什么不能消除（实测证据）

| 检查项                     | 结果                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| npm 已发布最高版本         | `0.1.0-beta.34`（`dist-tags`: `beta=0.1.0-beta.34`, `latest=0.1.0-beta.0`）                                           |
| vendor 内版本              | `0.1.0-beta.35`，来源提交 `74662b614e209e38a7b2b4557aa28df01141be25`                                                  |
| beta.34 tarball 是否含修复 | **否**。`dist/wc/zw-dialog.entry.js` 与全包内 `@zeus-web/dialog/state`、`@zeus-web/dialog/consumed-escapes` 均 0 命中 |
| vendor 版是否含修复        | 是，两个标记各 1 处（`dist/index.js:69,83`）                                                                          |
| `check:admin` 是否强制要求 | 是。`verify-vendored-dialog.ts` 缺任一标记即 `fail`                                                                   |
| 文件差异                   | 69 个共有文件中 26 个不同，差异内容即焦点陷阱与受控/非受控状态修复                                                    |
| 依赖差异                   | 5 个 dependencies 完全一致；差异仅 `version` 字段                                                                     |

发布时序是根因：`0.1.0-beta.34` 发布于 2026-10-26，修复提交
`74662b61` 在 2026-11-14。**这是发布缺口，不是源码缺失** —— zeus-ui main 已含修复，
只是尚未发布。

`check:vendored-dialog` 本轮实跑通过：

```text
vendored dialog ok: @zeus-web/dialog@0.1.0-beta.35 from 74662b61
  content:   sha256:30f23d06a9652ecbf48788ae225c0d1d52502dd98e51d4a87c85e1c984e04cec
  files:     69
  installed: 84462b34bc614527… (byte-identical)
```

### 4.2 为什么不迁移到 `examples/admin/vendor/dialog/`

迁移会同时触发五处耦合，而收益只是根目录少一个名字：

1. `.gitignore` / `.dockerignore` 的 `!vendor/zeus-web-dialog/dist` 例外规则 ——
   其顺序本身受 `check-root-structure.ts:checkIgnoreExceptionOrder` 校验，
   写反过一次导致 CI 拿到"只有 manifest 没有代码"的包。
2. `examples/admin/Dockerfile` 的 build context（目前 `COPY vendor ./vendor`）。
3. `pnpm-lock.yaml` 的 `file:` 解析与 `examples/admin/package.json` 相对路径。
4. `scripts/release/ui-sources.ts` 通过 manifest 的 `file:` 目标定位 provenance。
5. `scripts/ci/__tests__/image-build-inputs.spec.ts` 从 Dockerfile 的 `COPY`
   推导触发路径 —— 只改一侧会失败（这是好事，但说明耦合成网）。

按任务优先级（功能正确性 > 发布与供应链安全 > 测试可靠性 > 维护成本 > 根目录整洁度），
此项排在最后，收益不抵风险。**未关闭任何供应链校验。**

### 4.3 解除 vendor 的前提（记录备查）

需要一次 `@zeus-web/dialog` 发布（beta.35+），之后：Admin 依赖改回精确版本 →
删除 `vendor/zeus-web-dialog` → 删除 `verify-vendored-dialog.ts`、
`vendored-provenance.ts`、`link-local-dialog.ts` → 删除两个 ignore 文件中的例外
规则及 `checkIgnoreExceptionOrder` → 更新相关文档。**本次未做，也不应作为目录整理的副作用做。**

**VERIFIED**

---

## 5. `crates/` 与 `deploy/`：检查后保留

| 目录      | 结论 | 依据                                                                        |
| --------- | ---- | --------------------------------------------------------------------------- |
| `crates/` | 保留 | Rust workspace 的正常组织形式，`Cargo.toml` members 之一；不是治理目录      |
| `deploy/` | 保留 | `deployment-layout.ts` 把目录名当作**路径安全前缀**校验；改名等于改安全策略 |

两者均未发现冗余或无效文件：`crates/` 仅 `zeus_compiler`（Rust 源码 + tests +
examples）；`deploy/host-validation/` 5 个文件全部被部署脚本或 workflow 按名读取。

**VERIFIED**

---

## 6. Benchmarks 决策：迁移，并修复一个静默的覆盖收缩

迁移收益成立，因为该目录**已经是**基准工具的私有 fixture，而非独立测试领域：

- 唯一读取者是 `scripts/bench/component-host-config.ts` 的两行。
- 独立 workspace 包身份被完整保留（`pnpm --filter @zeus-bench/component-host`
  仍按名解析；`findWorkspacePackages()` 仍列出 60 个包）。

### 迁移中发现并修复的真实缺陷

`packages/compiler/compiler-wasm/__tests__/parity.test.mjs` 用固定根列表收集
`.tsx` 语料，其中一项是 `benchmarks`。迁移后该根贡献 **0 个模块**，而
`corpus.length > 60` 的守卫**仍然通过** —— 因为 `examples/` 单独就有 74 个。
fixture 的 9 个模块会从"native vs wasm 编译器输出必须一致"这一个测试里静默消失。

修复：根列表改为 `scripts/bench/fixtures`，并新增**逐根非空断言**，
让某个语料根被移走或清空时按名失败，而不是缩小总数。

```text
examples                          74
scripts/bench/fixtures             9
scripts/playground/fixtures        2
```

### 统计口径未变的证据

`scripts/bench/fixtures/component-host/dist/` 迁移前后 sha256 一致：

```text
before: e9244033b893836cd70c672cd8748da02f8bff90
after:  e9244033b893836cd70c672cd8748da02f8bff90
```

`pnpm bench:component-host:size` 与移动后包的 `tsc --noEmit` 均通过。

**VERIFIED**

---

## 7. 测试命令及真实执行结果

环境：macOS arm64，Node `v24.16.0`（仓库引擎要求 `^22.18.0 || >=24.11.0`，
默认 PATH 的 22.12 会被拒绝），pnpm `10.33.4`。

| 命令                                       | 结果                                         | 说明                                                                                    |
| ------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm check:root`                          | **PASS**                                     |                                                                                         |
| `pnpm check:release-pairing`               | **PASS**（`release pairing records passed`） | 含 4 份记录结构校验                                                                     |
| `pnpm check:structure`                     | **PASS**（6 domains, 38 packages）           | 发布组未受影响                                                                          |
| `pnpm check:vendored-dialog`               | **PASS**（69 文件，逐字节一致）              |                                                                                         |
| `pnpm check`（tsc）                        | **PASS**（0 error）                          | 首次因本机缺 peer 依赖报 76 个错，`pnpm install --frozen-lockfile` 后为 0；与本迁移无关 |
| `pnpm build`                               | **PASS**（exit 0）                           |                                                                                         |
| `pnpm -F @zeus-js/example-admin build`     | **PASS**（exit 0）                           | vendor 消费链完好                                                                       |
| `pnpm bench:component-host:size`           | **PASS**，产物 digest 与迁移前相同           |                                                                                         |
| `pnpm exec tsc --noEmit`（fixture 内）     | **PASS**                                     |                                                                                         |
| `pnpm test-unit`（全量，`--maxWorkers=1`） | **PASS**，276/277 文件、3395 项通过          | 1 个文件 skip；0 失败                                                                   |
| `pnpm check:golden-components`             | **BLOCKED_ENV**                              | 需要真实 npm registry + 三浏览器 + Sigstore；CI 中仅在 `workflow_dispatch` 运行         |
| Admin 镜像构建（docker）                   | **NOT_RUN**                                  | 未在本轮执行；`vendor/` 未移动，Dockerfile 未改，风险面为 0                             |

全量单测最终结果：

```text
Test Files  276 passed | 1 skipped (277)
     Tests  3395 passed | 20 skipped (3415)
  Duration  530.59s
```

并行（默认 worker 数）运行时曾出现 9 个**超时**（非断言失败），涉及
`output-wc/public-declarations.spec.ts`（30s 上限）等重型测试；单独重跑该文件
4/4 通过（12.3s），`--maxWorkers=1` 全量运行 0 失败。这是本机既有的负载超时，
已记录在项目记忆中，与路径迁移无关。

定向测试（迁移直接相关，全部通过）：

```text
scripts/check/__tests__/check-root-structure.spec.ts        39 passed
scripts/release/__tests__/pair-attestation.spec.ts          31 passed
scripts/release/__tests__/historical-latest.spec.ts
scripts/release/__tests__/release-pairing.spec.ts
scripts/release/__tests__/release-pairing-wiring.spec.ts
scripts/release/__tests__/release-wiring-regressions.spec.ts
scripts/release/__tests__/release-workflow.spec.ts
scripts/check/__tests__/check-ui-pairing.spec.ts
scripts/check/__tests__/golden-component-fixtures.spec.ts
scripts/ci/__tests__/impact-analysis.spec.ts
scripts/bench/component-host-size.spec.ts
```

### 新增的负向回归测试

| 测试                                                                      | 防止什么                                     |
| ------------------------------------------------------------------------- | -------------------------------------------- |
| 旧路径 `release-pairing` / `release-policy` / `tests` / `benchmarks` 重现 | 目录被习惯性重建后无人发现                   |
| `meta/` 必需路径缺失（逐条，不是只报第一个）                              | 配对记录丢失要到打标签时才发现               |
| 这些旧名不再在 `ALLOWED_ROOT_DIRECTORIES` 中                              | 允许列表静默接受旧布局                       |
| 标签树双路径读取：优先新布局 / 回退旧布局 / 两者皆无则拒绝                | 已发布 rc 无法再配对                         |
| 损坏的记录不得回退到另一路径                                              | 两个互相矛盾的记录中"后者胜出"               |
| `--out` 不在 attestation 目录内时拒绝                                     | 写到发布流程永远读不到的位置                 |
| parity corpus 每个根必须贡献 ≥1 个模块                                    | 语料根被移走后总数守卫仍通过（本轮真实缺陷） |

迁移前的负向验证：`check-root-structure.spec.ts` 的「旧路径重现」用例首次运行即失败
（`tests` 当时只以文件级路径登记），证明这些测试确实会失败，而不只是会通过。

---

## 8. 仍然存在的风险、阻塞与技术债

| 项                                                       | 等级 | 说明                                                          |
| -------------------------------------------------------- | ---- | ------------------------------------------------------------- |
| `@zeus-web/dialog` 的修复未发布                          | 高   | 阻塞 vendor 消除；属于发布决策，不是目录整理                  |
| 全量单测在本机需 `--maxWorkers=1`                        | 低   | 既有环境限制，CI 不受影响                                     |
| `pnpm check:golden-components` 未在本轮执行              | 低   | `BLOCKED_ENV`；契约文件 sha256 与 main 相同，迁移未改内容     |
| Admin 镜像未在本轮构建                                   | 低   | Dockerfile 与 vendor 均未改动                                 |
| 历史文档中的旧路径（32 处，均为 dated 记录）             | —    | 刻意保留，属"历史真实性"                                      |
| `docs/release-process.md` 未描述配对目录（迁移前即如此） | 低   | 配对协议只在 `meta/release/pairing/README.md` 与 AGENTS.md §6 |

### 无兼容层 / 空壳 / 死路径

- 三个旧目录已 `rmdir` 删除，工作树中不存在空目录。
- 无转发文件、无旧路径 re-export。
- 唯一保留旧路径字面量的是 `TAGGED_RECORD_PATHS` 的第二项，它读的是
  **不可移动的历史标签树**，不是本地目录；已被 `MIGRATED_TO_META` 的
  "旧路径重现"检查覆盖，两者不会互相抵消。

---

## 9. 涉及 commit

| SHA        | 内容                                                                                |
| ---------- | ----------------------------------------------------------------------------------- |
| `651def2c` | `refactor(meta)`：三个治理目录迁入 `meta/`，含标签树双路径读取                      |
| `c006929e` | `refactor(bench)`：fixture 迁入 `scripts/bench/fixtures/`，修复 parity 语料静默收缩 |
| `3631ac56` | `feat(check)`：根目录契约双向检测，补负向测试                                       |
| `205a8f35` | `fix(release)`：`--out` 根推导随目录深度变化                                        |
| `28cd31b8` | `docs(architecture)`：本迁移记录                                                    |
| `43f76701` | `ci(impact)`：`meta/` 归类为 release 数据，不再退化为全量套件                       |
| `7c2c2bce` | `docs(architecture)`：补全量单测结果                                                |

PR：[#396](https://github.com/baicie/zeus/pull/396)
（分支 `refactor/repo-root-structure-cleanup`；#395 因分支名不合规关闭）。

该分支的起点 `290a0cb3`（`test(check)`，Vite 消费者 Show 分支）早于本次迁移，
不属于本轮改动，随分支一并进入 PR。
