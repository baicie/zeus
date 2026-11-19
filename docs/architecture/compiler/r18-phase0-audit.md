# R18.0 Phase 0 — 编译器架构审计

基线：`bb47879221ef011dfdba012eee56c09a37f63640`（R17.0，PR #326 已合入）。

本报告区分**事实**（源码、CI、registry 直接核验）与**判断**（推论与设计提案）。所有 P0/P1 条目都附 `file:line` 或 CI job。

审计方式：五个独立维度并行（依赖图、状态所有权、IR 契约、文档漂移、CI 发布），每条断言由独立 agent 回到源码做对抗验证；被证伪的断言已从下列问题清单剔除（见 §6）。

---

## 1. 基线事实

| 项目                    | 值                                                           |
| ----------------------- | ------------------------------------------------------------ |
| 本地 HEAD = origin/main | `bb478792`                                                   |
| 工作树                  | clean                                                        |
| 开着的 PR               | 0（审计时）                                                  |
| main CI（`bb478792`）   | CI run 44495067774 **全绿**，13/13 job success               |
| Compiler Native Matrix  | run 44495067792 success                                      |
| Release Canary          | run 44495067751 success                                      |
| Docs                    | run 44495067737 **failure**（详见 P1-8）                     |
| 保护的必需检查          | ruleset 27108543 只要求 `ci-gate`                            |
| `v0.2.0-rc.3`           | tag `aa7313ab` → `649e2f60`；Release run 44447893463 failure |
| rc.3 发布面             | 32 包中 **7 已发 / 25 缺失**                                 |

模块规模（事实）：

```
codegen/mod.rs  3,957 行      lower.rs      3,564 行
support/nesting 1,491         codegen/ssr   768
codegen/analysis 405          ir.rs         505
support/hydration 348         support/hmr   186
```

全 crate grep：无 `LoweringContext`、无 `AnalysisResult`、无 `EmitPlan`、无 `pipeline.rs`、无 `codegen/dom.rs`。

---

## 2. 已证实的模块依赖图

只列 confirmed 边。

```
lib.rs ──► lower (lower_module, lib.rs:133)
       ──► ssr (validate_ssr_properties, :187)
       ──► support/hydration (build_hydration_plan, :199)
       ──► codegen (emit_ssr_module :201, emit_module :213)
       ──► support/{diagnostic,span,hmr,hydration,nesting} re-export (:7-8)

codegen/mod ──► ir
            ──► lib 类型 (PureDefineElementMode, RawSourceMap, TransformModuleResult, :22)
            ──► lower (HmrInfo, SsrImportReplacement, SsrImportRewrite, :30)
            ──► support/{html :32, hydration :33, span :31/2696, hmr :181/212}
            ──► codegen/analysis (:12-15)
            ──► codegen/ssr (:8, :10)

codegen/analysis ──► ir
                 ──► codegen/mod (RuntimeHelper :3511, collect_builtin_helper_usage :3125)  ← 环
codegen/ssr ──► ir, support/{html :18, hydration :19}, lib 类型 :12
            ──► codegen/mod (super 19 项, :23-28)                                        ← 环

support/hmr ──► ir (:11-13), oxc (:4-7), support/html (:10)
support/hydration ──► ir (:3-7), support/html (:8)
support/diagnostic ──► support/span (:3)
ir ──► support/span (:8)
lower ──► ir, support/{html :20, span :36, diagnostic :25}
ssr ──► ir, support/{diagnostic :8, html :9}
```

**两个环**（P0-1、P1-1）与**三处 leaf 违规**（P1-2、P1-3）在 §3 展开。

---

## 3. P0 — 必须修复

### P0-1 `analysis` 与 emitter 互为依赖，analysis 不是独立阶段

事实：

- `codegen/analysis.rs:21` → `use super::{RuntimeHelper, collect_builtin_helper_usage};`
- `RuntimeHelper` 定义在 `codegen/mod.rs:3511`，`collect_builtin_helper_usage` 在 `:3125`
- `codegen/mod.rs:12-15` 反向 import analysis 的 4 个函数

后果：analysis 无法被单独理解、测试或搬迁；边界测试无从建立。违反 `module-ownership.md:124`（"analysis reads ir; it must not emit"）与 `:99-101`（禁止 "Codegen that re-analyses"）。

**状态：已在 PR #327 修复。**

### P0-2 `AGENTS.md` 的编译器宿主路径仍是迁移前目录

`AGENTS.md:706-707` 写 `packages/core/compiler-native` / `compiler-wasm`；实际是 `packages/compiler/`。`Cargo.toml:4-5` 用新路径，`check-structure.ts:356-366` 已把旧路径列为 retired。AGENTS.md 是 agent 首要契约，错误路径会把后续会话引向不存在的目录。

**状态：已在 PR #328 修复，并加守卫。**

### P0-3 包版本表与实际发布组漂移

`docs/api/packages.md:21` 声称与各 `package.json` 同步；实际 31 行全写 `0.1.1-beta.20`，而树在 `0.2.0-rc.3`。同时缺 `@zeus-js/playground-engine`（可发布且在固定组）。

**状态：已在 PR #328 改为从 manifest 派生，并加守卫。**

---

## 4. P1 — 应当修复

### 4.1 编译器架构

**P1-1 `codegen/ssr.rs` 与 `mod.rs` 的第二个环** — `mod.rs:8` 声明 `mod ssr;`，`ssr.rs:23-28` 从 `super` 反向导入 19 项。四个 SSR-only 定义仍在 DOM emitter：`SSR_TEXT_END_MARKER`（`mod.rs:316`）、`SsrTextContext`（`:319`）、`SsrRuntimeNames`（`:3285`）、`ssr_text_context`（`:2594`）。注意 `is_unescaped_raw_text`（`:2590`）同时被 DOM 模板渲染使用（`:2354`、`:2396`），属共享代码，不能一并搬。

**P1-2 `support/hmr.rs` 是 pass，不是 leaf** — `:4-7` 引入 Oxc，`:11-13` 引入 IR；`prepare`（`:37-86`）遍历 RootIr 并切片源码生成签名，`rewrite_expression` 在 `:185` 改写 `expression.code`。与 `support/mod.rs:3-6` 的 "Nothing here knows about JSX, the IR or code emission" 直接矛盾。

**P1-3 `support/hydration.rs` 是整模块分析** — `:3-7` 导入 14 个 IR 类型，`build_hydration_plan`（`:47-64`）遍历 ModuleIr，在 `lib.rs:199` 作为流水线阶段调用，并在 `lib.rs:8` 作为公共路径导出。`:66-88` 的 marker-id 函数是纯格式化，可留作 leaf。

**P1-4 codegen 依赖 lowering 的私有类型** — `codegen/mod.rs:30` → `lower::{HmrInfo, SsrImportReplacement, SsrImportRewrite}`。阶段契约长在 lowering 内部；真实方向是 `codegen → lower`（与审计初稿相反，已按核验修正）。

**P1-5 公共 API 路径约束** — `lib.rs:7-8` 的 `pub use support::{diagnostic, span, hmr, hydration, nesting}` 使 `zeus_compiler::hmr` / `::hydration` 成为稳定路径；两个宿主实际消费（`packages/compiler/compiler-native/src/lib.rs:10-17`）。搬迁 P1-2/P1-3 必须在同一改动中重定向 re-export，否则是公开 API 破坏。

**P1-6 `Lowerer` 单一可变状态阻碍 Phase 2** — `lower.rs:411-429` 一个 struct 同时持有 8 个只读事实（`source:412`、`filename:413`、`allocator:414`、`source_index:415`、`builtin_names:419`、`define_element_setup_spans:421`、`host_root_spans:422`、`scoping:424`）与 7 个可变状态（`next_id:416`、`components:417`、`diagnostics:418`、`error_boundary_spans:420`、`host_depth:423`、`for_accessor_scopes:425`、`namespace:428`）。impl `454-2534` 共 60 个方法：47 个 `&mut self`、12 个 `&self`、1 个关联方法；31 个 `&mut` 方法不直接写字段、只为调用兄弟方法；23 个可达 ≥3 个状态字段。`diagnostics` 同时充当控制流（`:2204`/`:2213`），且该类型本身是 Oxc Visit walker（`:2575-2584`）。

**P1-7 IR 契约漂移** — `IrRef` 同名但身份模型不兼容（Rust `node_id: u32`，`ir.rs:44-46`；TS `{name: string}`，`nodes.ts:34-36`）；`ElementIr.attributes` 对 `ElementIR.attrs`；`DynamicTextIr.expression` 对 `DynamicTextIR.expr`；`ComponentIr`（模块记录，`ir.rs:23-28`）与 `ComponentIR`（JSX 节点，`nodes.ts:147-154`）是重名而非同概念，后者真实对应 `ComponentBindingIr`（`ir.rs:289-296`）。fixture `tests/ir.rs:131` 只覆盖 5/6 个 `AttributeIr` 变体（缺 `SpreadBinding`）。

### 4.2 CI 与发布

**P1-8 Docs 部署失败** — run 44495067737 的 `deploy` job 在 "Deploy to GitHub Pages" 失败，日志 `Found 0 artifact(s)`；但该 run 的 github-pages artifact 存在（id 14515050767，4,224,324 bytes）且 "Build docs" success。不是构建失败，是部署取产物失败。

**P1-9 rc.3 发布不完整** — run 44447893463 在发布第 8 个包 `@zeus-js/compiler-native-linux-x64-gnu` 时 TLOG 409 中断；32 包中 7 已发、25 缺失；`@zeus-js/i18n` 在 registry 上零版本（404）且仍在固定组（`release.config.ts:20`）。无 GitHub Release，发布后校验步骤全部 skipped。

---

## 5. P2 — 值得做

- **emit 期重复分析**：`collect_delegated_events` 已在 `mod.rs:77` 产出集合，`RuntimeNames::should_delegate_event` 仍在 `:3506` 调 `is_delegatable_event`。
- **没有 AnalysisResult/EmitPlan**：`emit_module` 在 `:76-83` 内联构建计划；`transform_module`（`lib.rs:128-230`）在阶段间传原始 IR 与 side channel。
- **`LowerResult` side channel**：`lower.rs:40-48` 携带 `hmr: HmrInfo`、Span 列表、`SsrImportRewrite` 列表，违反 AGENTS.md 16.2 规则 2。
- **`ComponentEmitter` 是参数包不是对象**：4 字段、0 方法、1 个使用点（`:144-149` 构造、`:156` 传入、`:353-356` 立即解构）。
- **`CodeWriter` 混入 emitter 状态**：`for_accessor_scopes`（`:3634`）属发射上下文；`ssr.rs:588` 调用 `push_dom_expression` 但从不建立 scope，SSR 的 accessor 包装恒为空。
- **`HelperUsage` 封装被绕过**：5 个自由函数直接以 `&mut HashSet<RuntimeHelper>` 传递，38 处 `.0` 访问。
- **`.prettierignore`** 与 **`eslint.config.js`** 的覆盖缺口（已在 PR #328 修复）。
- **`package.json:12`** 的 `clean` 未覆盖 `packages/compiler|features|create/*/dist`。
- **文档**：`current-pipeline.md`、`module-ownership.md`、`validation-matrix.md` 的行号与状态已过期（部分已在 PR #328 修正路径，行号未逐一更新）。
- **`performance-baseline.md:39`** 声称在独立 worktree 用同一示例测量，但 `examples/perf-baseline.rs` 在基线 `649e2f60` 不存在（该文件由 `bb478792` 引入），before/after 无法仅凭两个提交复现。

---

## 6. 被证伪的断言（已从问题清单剔除）

对抗验证推翻的原始审计结论：

| 原断言                                              | 实际                                                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "五个 SSR-only 定义"                                | 只有四个；`is_unescaped_raw_text` 也被 DOM 使用                                                                                                                                                   |
| "`lower.rs → codegen`"                              | 方向相反，真实边是 `codegen/mod.rs:30 → lower`                                                                                                                                                    |
| "`d3b52f8e` 的 CI 有 12 个绿 job"                   | 11 success / 1 cancelled / 1 failure                                                                                                                                                              |
| "5 个 compiler 包 latest 都在 canary"               | 4 个 native 包；compiler 本体 latest=0.1.0                                                                                                                                                        |
| "compiler-shared 删除会破坏 tsconfig/lockfile/... " | 多数被证伪（惰性陈旧数据）。真正硬失败的是 `tests/ir.rs` 的 `include_str!`、changesets 固定组校验、三个发布门禁、`check-package-cjs.ts:73`、`release-config.spec.ts`、`check-structure` 的域/总数 |
| "SsrRuntimeNames 只有一个方法"                      | impl 有 14 个函数                                                                                                                                                                                 |
| "每个 emission 函数都收 names"                      | 31/66                                                                                                                                                                                             |
| "rustOnly 15 个类型没有 TS 对应概念"                | 至少 8 个有对应；只有"没有同名 TS 类型"成立                                                                                                                                                       |

---

## 7. 事实 vs 判断

**事实**：§2 的依赖图（逐条核对行号）、§3/§4 的每个 `file:line`、§1 的 CI 与发布状态、§6 的被证伪列表。

**判断（不得当作事实）**：

- **P0/P1/P2 分级与 "God Object" 标签**：底层测量（60 方法、47 `&mut`、7 字段、3,564 行）是事实；"God" 是定性。
- **`LoweringContext` 方案**：设计提案，不是源码事实。
- **TLOG 409 成因**（同一 tarball 先前已签名但未落库）：审计自标 not proven。
- **性能数据不可复现**：`perf-baseline.rs` 在基线不存在是事实；是否手工回填无法从仓库判定，故**不认定造假**，但现有 before/after **不能**当作可复现证据。
- **compiler-shared**：无源码消费者是事实；"可以删除"是发布决策，需独立提案。

---

## 8. 本轮已做的修复

| PR   | 内容                                                                                  | 对应问题              |
| ---- | ------------------------------------------------------------------------------------- | --------------------- |
| #327 | 解除 analysis ↔ emitter 循环；新增 6 个依赖边界测试                                   | P0-1                  |
| #328 | AGENTS.md 路径、5 个 homepage、prettierignore、eslint 覆盖、包表派生化；新增 5 个守卫 | P0-2、P0-3、P2 配置项 |

两个 PR 均不改编译器输出：45 个黄金 fixture 字节一致。

---

## 9. 剩余债务与判定

**COMPILER_MODERNIZATION_COMPLETE = 未达成。** 未完成的阶段目标（均未开始）：

1. **Phase 2**：无 `LoweringContext`；`lower.rs` 仍 3,564 行、单 struct 混装 8 事实 + 7 状态。
2. **Phase 3**：无 `AnalysisResult` / `EmitPlan`；`support/hmr.rs` 与 `support/hydration.rs` 仍承载 IR 遍历与改写（P1-2、P1-3）。
3. **Phase 4**：无 `pipeline.rs`；`codegen/mod.rs` 仍含 DOM 发射、模板、hydration、HMR、source map、writer（P1-1）。
4. **性能证据**：无同环境、带方差的重构前后对照（P2）。
5. **发布**：rc.3 仍 7/32（P1-9）；Docs 部署失败（P1-8）。

下一步按依赖顺序：P1-1（SSR 环）→ P1-6（Lowering 上下文）→ P1-2/P1-3（support 归位，含 re-export 重定向）→ AnalysisResult/EmitPlan → pipeline.rs → 性能基线重建。
