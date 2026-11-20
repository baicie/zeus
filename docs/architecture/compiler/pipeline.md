# 编译器 Pipeline（现行）

本文描述 `crates/zeus_compiler` **当前**的模块结构与阶段顺序，基线 `cc9a8254`。

**为什么重写一份：** 同目录下的
[`current-pipeline.md`](./current-pipeline.md) 标题写着 "Current"，但记录的
是 R17.0 之前（`649e2f60`）的状态，其中的行号在 R18.2 拆分 `Lowerer`
之后已全部失效。那份文档现作为历史快照保留，不再代表现行结构。

**本文刻意不写行号。** 行号在每次重构后都会腐坏，而模块边界不会。
需要定位时用 `grep -n`，不要相信任何文档里的行号。

---

## 1. 模块布局

```
crates/zeus_compiler/src/
├── lib.rs              公开入口 transform_module + TransformTarget
├── ir.rs               Zeus IR：编译语义的唯一事实来源
├── lower.rs            解析、语义分析、JSX → ModuleIr
├── ssr.rs              目标相关的拒绝规则（SSR 属性校验）
├── stage_contracts.rs  跨阶段传递类型，不 import 任何阶段
├── analysis/           读 IR 得出事实，不发射、不改写
│   └── hydration.rs    build_hydration_plan → HydrationPlan
├── passes/             对 IR 的重写，不改语义
│   └── hmr.rs          HMR 槽位准备与绑定重写
├── codegen/            事实 → JavaScript
│   ├── mod.rs          DOM 发射与模板渲染
│   ├── ssr.rs          SSR 发射
│   ├── analysis.rs     发射前的事实收集
│   └── infra.rs        DOM/SSR 共用基础设施
└── support/            跨阶段叶子能力
    ├── diagnostic.rs   CompilerDiagnostic
    ├── span.rs         位置信息
    ├── html.rs         HTML 名称与属性处理
    ├── nesting.rs      在 Oxc 之前拒绝会耗尽栈的输入
    ├── hmr.rs          HmrPlan / HmrBinding（纯数据）
    └── hydration.rs    HydrationPlan 与标记 ID 格式化（纯数据）
```

### 分层规则

| 层                | 实际依赖（已核对）                             | 禁止依赖                        |
| ----------------- | ---------------------------------------------- | ------------------------------- |
| `support`         | `oxc_span`、`serde`、自身                      | 任何阶段、`ir`                  |
| `ir`              | `serde`、`support::span`                       | 任何阶段                        |
| `lower`           | `ir`、`support`、`stage_contracts`             | `codegen`、`analysis`、`passes` |
| `passes`          | `ir`、`support::hmr`、`support::html`          | `codegen`、`lower`、`analysis`  |
| `analysis`        | `ir`、`support::hydration`、`support::html`    | `codegen`、`lower`、`passes`    |
| `codegen`         | `ir`、`support`、`analysis`、`stage_contracts` | `lower`、`passes`               |
| `stage_contracts` | 仅 `oxc_span::Span`                            | 任何阶段                        |
| `lower`           | `ir`、`support`、`stage_contracts`             | `codegen`、`analysis`、`passes` |
| `passes`          | `ir`、`support::hmr`、`support::html`          | `codegen`、`lower`、`analysis`  |
| `analysis`        | `ir`、`support::hydration`、`support::html`    | `codegen`、`lower`、`passes`    |
| `codegen`         | `ir`、`support`、`analysis`、`stage_contracts` | `lower`、`passes`               |
| `stage_contracts` | 仅 `oxc_span::Span`                            | 任何阶段                        |

这些依赖已用 `grep -h '^use crate::'` 逐模块核对，不是设计意图的转述。

这些边界由 `tests/boundaries.rs` 用 `syn` 解析 `use` 语句强制执行，
并且每条边界都有一条**注入违规必须失败**的负向测试。

**核心规则：一个阶段可以计算事实并记录下来，但不得回头到后续阶段重新推导。**

---

## 2. 阶段顺序

`transform_module`（`lib.rs`）是唯一入口，两个宿主共用：

```
nesting_diagnostic          栈耗尽预检，失败即返回 ZEUS_INPUT_TOO_DEEP
        ↓
lower::lower_module         解析 → 语义分析 → JSX → ModuleIr
        ↓                   同时产出 HmrInfo、SsrImportRewrite、
        ↓                   defineElement 调用、error_boundary_spans
诊断非空 → 返回空 code
        ↓
无可降级内容 → 原样返回源码
        ↓
SSR 目标 + ErrorBoundary → ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED
        ↓
SSR 目标 → ssr::validate_ssr_properties
        ↓
analysis::hydration::build_hydration_plan   读 IR，产出 HydrationPlan
        ↓
codegen::emit_ssr_module  |  codegen::emit_module
        ↓
回填 hydration_plan
```

要点：

- **Hydration 计划在发射之前算好**，由 `analysis` 产出、`codegen` 消费。
  emitter 不再自己遍历 IR 推导 hydration 标记。
- **HMR 重写在 `passes/hmr.rs`**，`codegen` 只按计划发射 `emit_hmr_*`。
- 没有独立的 `pipeline.rs`：阶段顺序仍在 `lib.rs` 的 `transform_module` 中。
  这是已知的剩余技术债，不是设计意图。

---

## 3. 两个宿主

| 宿主   | 包                                  | 绑定方式     |
| ------ | ----------------------------------- | ------------ |
| Node   | `packages/compiler/compiler-native` | napi         |
| 浏览器 | `packages/compiler/compiler-wasm`   | wasm-bindgen |

两者都编译同一个 `zeus_compiler` crate，调用同一个 `transform_module`。
**不得为某一侧复制编译逻辑。** 任何一侧的行为差异都是缺陷。

WASM 侧的 `.wasm` 产物不入库（`.gitignore` 已排除），由
`pnpm --filter @zeus-js/compiler-wasm build:wasm` 生成。

---

## 4. 安全网

| 机制     | 位置                      | 覆盖                                                                               |
| -------- | ------------------------- | ---------------------------------------------------------------------------------- |
| 黄金基线 | `tests/golden.rs`         | 45 个 fixture，比对 code / map / diagnostics / hydrationPlan / hmrPlan，**字节级** |
| 边界测试 | `tests/boundaries.rs`     | 26 项，含每条边界的负向注入                                                        |
| 状态隔离 | `tests/lowering_state.rs` | 11 项，跨模块状态泄漏、节点 ID 分配、作用域平衡                                    |

`ZEUS_UPDATE_GOLDEN=1` 只在**确认变更有意**时使用，且必须在提交信息里说明原因。
为了让重构通过而刷新快照不构成验证。

---

## 5. 相关文档

- [模块归属](./module-ownership.md) — 每个模块负责什么、不负责什么
- [IR 契约](./ir-contract.md) — `ir.rs` 的类型契约
- [校验矩阵](./validation-matrix.md) — 各类目标下拒绝什么
- [历史快照：R17.0 之前的 pipeline](./current-pipeline.md) — **不再代表现行结构**
- [R18.3 根目录治理审计](../r19-root-governance-audit.md)
