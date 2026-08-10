# Rust 编译器实施计划

本计划执行 RFC-005。每个任务保持为可独立验证的小切片；默认编译器在完整 parity
之前仍是当前 Babel 实现，但不会增加公开后端开关或 fallback。

## 依赖图

```text
RFC-005 / transformModule contract
  -> Rust workspace + toolchain
    -> owned IR + diagnostics
      -> Oxc parse / semantic / lowering
        -> DOM passes / codegen / source map
          -> napi-rs adapter
            -> Node runtime test
              -> Vite integration test
                -> CI + platform packaging
```

## Phase 1：设计与基础设施

### Task 1：固化架构决策

**说明：** 记录 Oxc / SWC / 其他方案比较、跨语言边界、span 单位、NAPI 接口和最终删除
Babel 的门槛。

**验收标准：**

- [x] RFC 明确选择 Oxc `0.144.0` + napi-rs 3，并解释拒绝其他方案的原因。
- [x] Oxc AST 不进入 IR / NAPI / TypeScript 公共类型。
- [x] 明确不存在公开双后端和 Babel fallback。

**验证：**

- [x] `pnpm exec prettier --check docs/rfcs/RFC-005-rust-compiler.md docs/internal/rust-compiler-implementation-plan.md`

**依赖：** 无

**涉及文件：** RFC-005、RFC index、本计划

### Task 2：建立 Rust workspace

**说明：** 建立只包含纯 core 和 Node adapter 的 Cargo workspace，锁定 Rust / Oxc
版本并配置一致的 fmt、clippy 和 test 命令。

**验收标准：**

- [ ] `rust-version = 1.95.0`，Oxc crates 全部精确为 `=0.144.0`。
- [ ] 不启用 Oxc `full` umbrella feature。
- [ ] `cargo fmt --check`、`cargo clippy --workspace --all-targets -- -D warnings`、
      `cargo test --workspace` 可在干净 checkout 运行。

**验证：** 上述三个 Cargo 命令。

**依赖：** Task 1

**预计规模：** S

## Phase 2：首个 compiler core 纵向切片

### Task 3：owned IR 与结构化诊断

**说明：** 为首个 fixture 定义 owned module / element / text / dynamic text IR 和诊断，
提供 serde round-trip 与 deterministic ID 测试。

**验收标准：**

- [ ] IR 不包含任何 Oxc 类型或 arena lifetime。
- [ ] 同一输入重复和并行 lowering 得到相同 ID / ref。
- [ ] span 遵守 UTF-8 byte offset、1-based line、0-based UTF-16 column 规则。

**验证：** `cargo test -p zeus_compiler ir`

**依赖：** Task 2

**预计规模：** M

### Task 4：Oxc parse、semantic 与 native element lowering

**说明：** 解析 TSX 模块，建立 semantic model，将 fixture 的原生元素、静态 attribute、
静态 text 和动态 text 降级为 owned Zeus IR；不支持用法返回稳定诊断。

**验收标准：**

- [ ] 支持 RFC fixture，表达式源码和 span 精确保留。
- [ ] parser 错误和 spread attribute 均返回带稳定 code / filename / span 的诊断。
- [ ] emoji、CJK、CRLF 前缀 fixture 的 span 转换正确。

**验证：** `cargo test -p zeus_compiler lower`

**依赖：** Task 3

**预计规模：** M

### Task 5：DOM codegen 与 source map

**说明：** 从 owned IR 生成静态 template、clone、anchor、`bindText` 和 helper import，
并生成 Source Map v3。

**验收标准：**

- [ ] 输出不包含 JSX，并调用现有 `@zeus-js/runtime-dom` helper。
- [ ] 生成标识符不会与输入模块 binding 冲突。
- [ ] source map 将生成代码中的动态表达式映射回原 TSX 表达式。

**验证：** `cargo test -p zeus_compiler codegen`

**依赖：** Task 4

**预计规模：** M

### Checkpoint A

- [ ] `cargo test -p zeus_compiler` 全通过。
- [ ] fixture 完成 TSX -> IR -> code + map，不依赖 Babel。
- [ ] core API 不暴露 Oxc 类型。

## Phase 3：Node 与 Vite 路径

### Task 6：薄 napi-rs adapter

**说明：** 用私有 `@zeus-js/compiler-native` package 承载 `zeus_compiler_node`，导出唯一
`transformModule(options)`，不复制 compiler 逻辑。

**验收标准：**

- [ ] 正常结果包含 code、map、diagnostics。
- [ ] compiler diagnostics 不被折叠为 exception string。
- [ ] panic 被 containment，不跨越 NAPI ABI。

**验证：** native build + Node contract tests。

**依赖：** Checkpoint A

**预计规模：** M

### Task 7：真实 runtime 与 Vite 集成测试

**说明：** Node 测试调用 native compiler；Vite fixture 使用内部 native plugin 编译并在
JSDOM 中执行，验证 DOM 和细粒度更新。

**验收标准：**

- [ ] 初始 DOM 为 `<div class="greeting">Hello Ada</div>`。
- [ ] signal 更新后只更新 text binding，组件函数不重新执行。
- [ ] Vite transform/build 均无残留 JSX，map 通过 `@jridgewell/trace-mapping` 精确断言。

**验证：** `pnpm test:compiler-native`

**依赖：** Task 6

**预计规模：** M

### Task 8：CI 基线

**说明：** 在主 CI 增加 Rust fmt/clippy/test 和当前平台的 native integration job；跨平台
prebuild matrix 留到 native package 进入发布前完成。

**验收标准：**

- [ ] CI 安装固定 Rust toolchain 并缓存 Cargo artifacts。
- [ ] native integration 不依赖开发机已有 `.node` 文件。
- [ ] JS-only jobs 不被未构建的私有 native package 破坏。

**验证：** 本地复现 CI 命令并检查 workflow syntax。

**依赖：** Task 7

**预计规模：** S

### Checkpoint B

- [ ] Cargo fmt、clippy、tests 全通过。
- [ ] native package build、Node runtime、Vite integration 全通过。
- [ ] 现有 compiler / compiler-shared targeted tests 全通过。
- [ ] `pnpm check`、`pnpm lint`、`pnpm build` 不回归。

## 后续迁移切片

以下任务不属于首个纵向切片的完成条件，但顺序和删除门槛已确定：

1. 补齐 attribute / property / event / ref，扩大原生 DOM parity。
2. Fragment 与普通组件，收敛 module-level IR 和名称分配。
3. `Show` / `For`、DOM path passes 和子树 disposal。
4. `Host` / `Slot`、semantic symbol 驱动的 `defineElement` 识别。
5. RFC-004 SSR 与真实 runtime execution parity。
6. HMR pass 和 source map chain。
7. Vite 与 Web-C bundler adapter 统一调用 `transformModule`。
8. 三平台 prebuild / provenance / canary 验证。
9. 一次性删除 Babel compiler、Babel HMR、旧配置和重复 adapter。

## 风险控制

| 风险                           | 影响 | 控制方式                                                               |
| ------------------------------ | ---- | ---------------------------------------------------------------------- |
| Oxc 0.x API 漂移               | 高   | 精确锁版；Oxc 类型仅在 adapter 内；升级单独 PR                         |
| IR 在 TS / Rust 间漂移         | 高   | JSON golden fixture + 双端 round-trip；默认切换前收敛 canonical schema |
| Unicode span / source map 错误 | 高   | emoji、CJK、CRLF fixture；trace-mapping 精确断言                       |
| NAPI 平台发布复杂              | 高   | 迁移期保持 private；默认切换前完成三平台 prebuild 与 provenance        |
| 旧 Rust 实现诱导横向铺开       | 中   | 不恢复旧代码；始终用可执行 tracer bullet 推进                          |
| Babel / Rust 长期共存          | 高   | 不公开 backend；parity 后一次切换并删除 Babel                          |

## 完成定义

本阶段只有在 Checkpoint B 全部满足、代码质量复核无阻塞项、分支提交保持可构建时才
算完成。“RFC 已写”“Cargo 能编译”或“parser 能读 TSX”均不构成本阶段完成。
