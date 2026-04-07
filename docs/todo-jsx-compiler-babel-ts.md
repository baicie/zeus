# Zeus JSX 编译器（Babel + TypeScript）待办清单

> 依据 [zeus-jsx-compiler-babel-ts-design.md](./architecture/zeus-jsx-compiler-babel-ts-design.md) 整理，与 Rust + OXC 路线并行记录于本文档，便于 MVP 阶段快速迭代与后续迁移规划。

**关联设计**：`docs/architecture/zeus-jsx-compiler-babel-ts-design.md`（文档版本 1.0.0，更新日期 2026-04-07）  
**本文档更新**：2026-04-07（核心实现已落地）

---

## 1. 目标对齐（设计 §2）

| 类别 | 项 | 优先级 | 状态 |
|------|-----|--------|------|
| 功能 | 无虚拟 DOM，直接 DOM 操作 | P0 | 待验证 |
| 功能 | 最小化运行时 | P0 | 待验证 |
| 功能 | 细粒度响应式（alien-signal） | P0 | 待验证 |
| 功能 | DOM / SSR / universal 多模式 | P1 | 未开始 |
| 功能 | 输出 ES5 兼容 | P1 | 未开始 |
| 体验 | 错误提示、SourceMap | P2 | 未开始 |
| 性能 | 编译 &lt; 50ms/千行 JSX、运行时 gz &lt; 5KB 等 | — | 未度量 |

---

## 2. 包与目录落地（设计 §3.1）

按设计创建 workspace 包并完成最小 `package.json` / 导出：

- [x] `packages/compiler` — Babel 插件核心（`transformSync` 等）
- [x] `addons/babel-preset-zeus` — 组合 TS preset + compiler
- [x] `addons/rollup-plugin-zeus` — Rollup 集成（缓存、SourceMap）
- [x] `addons/vite-plugin-zeus` — Vite 集成（含 HMR 钩子占位）

---

## 3. 分阶段实现（设计 §9.1）

### 阶段 1：核心基础设施（约 2 周）

- [x] 项目结构搭建（`packages/compiler/src` 目录与入口）
- [x] `config.ts` — `CompilerOptions` / `DEFAULT_CONFIG`（与设计 §4.1、附录 B 一致）
- [x] `shared/types.ts` — 转换结果、ScopeData、DynamicAttr 等（附录 A）
- [x] `shared/utils.ts`、`dynamic.ts`、`escape.ts`、`constants.ts`
- [x] Babel 插件入口 `index.ts`（注册 visitor）
- [x] 预处理 / 后处理（Program enter/exit：`preprocess` / `postprocess`）
- [x] `transformSync({ code, filename, options })` 对外 API（设计 §8）

### 阶段 2：DOM 元素转换（约 2 周）

- [x] 基础标签（div、span 等）→ 模板 + 运行时调用
- [x] 静态属性内联
- [x] 动态属性与动态性检测（`shared/dynamic.ts`）
- [x] 事件（onClick 等）与委托事件收集
- [x] `class` / `className`、`style`（含动态 style helper 与对象差分更新）
- [x] 子节点与文本
- [x] `Fragment` 支持（文本/表达式/嵌套 JSX 子节点）
- [x] 模板字符串生成与模板注册（模块级 `_tmpl$`）

### 阶段 3：组件与高级特性（约 2 周）

- [x] 组件调用路径（`createComponent` 或项目约定 API）
- [x] 内置组件：`For`、`Show`、`Switch`、`Match`、`Portal`、`Suspense`、`ErrorBoundary`（及设计附录中的 `Index`、`Merge`、`Dynamic` 等）
- [x] `ref` 支持
- [x] 展开属性 `...props`
- [ ] 条件表达式包装（`wrapConditionals`）
- [ ] 列表渲染优化（与 `For` / 运行时协同）
- [ ] SVG 命名空间与标签分支

### 阶段 4：SSR（约 1 周）

- [ ] SSR 元素与模板值（`templateValues`）
- [ ] SSR 属性与转义策略
- [ ] Hydration 选项与可水合事件（`hydratable`）
- [ ] 与 `@zeus-js/server-renderer`（或设计中的 SSR 运行时）对齐 API

### 阶段 5：集成与优化（约 1 周）

- [x] Rollup 插件：`transform`、缓存、`include`/`exclude`（缓存策略待增强）
- [x] Vite 插件：`transform` + `handleHotUpdate` 基础行为
- [ ] 测试与 fixtures 补齐（见下节）
- [ ] 性能：解析/遍历/生成路径 profiling（设计 §10.2）
- [ ] 用户文档：preset 使用方式、与 Rolldown/Rust 方案关系说明

---

## 4. 测试计划（设计 §9.2）

**覆盖率目标**：单元 / 共享模块 &gt; 80%

- [x] `transform/`：`element`、`component`、`fragment`、`directive` 等单测（当前覆盖 element/component 主路径）
- [ ] `shared/`：`dynamic`、`escape`、`utils`
- [ ] `ssr/`：`element` 等
- [ ] `__tests__/fixtures/dom|ssr|universal` 与快照 / 对比测试
- [ ] 可选：playground / 真实场景 E2E

---

## 5. API 与配置核对（设计 §4、§8）

- [x] `CompilerOptions` 与 `DEFAULT_CONFIG` 全字段实现与文档一致
- [x] `moduleName`、`generate`、`delegateEvents`、`builtIns`、`requireImportSource` 等行为单测覆盖（核心路径）
- [x] Rollup / Vite 插件选项与 `CompilerOptions` 透传一致

---

## 6. 风险与依赖（设计 §10）

| 风险 | 应对任务 |
|------|----------|
| Babel 编译速度 | 评估 `passPerPreset`、缓存；长期记录 SWC/WASM 备选 |
| 动态性检测遗漏 | 对齐 dom-expressions 测试矩阵，增加回归用例 |
| SSR / hydration 复杂度 | 分阶段交付；对照 Solid 行为 |
| ES5 输出 | 输出层或下游 Babel 转译策略明确并固化到 preset |

---

## 7. 与 Rust + OXC 路线的关系

- **短期**：Babel + TS 用于 MVP 迭代与设计验证（本清单）。
- **长期**：核心算法稳定后，将等价变换迁移至 `compiler-core` / OXC（见设计 §1.2 渐进式图）。
- **仓库现状**：当前主路径仍为 Rust 编译器；实施本清单时请同步更新 [project.md](./project.md) 与根目录 [todo.md](./todo.md) 中的包列表与状态，避免重复描述同一功能的两套实现长期漂移。

---

## 8. 完成度速览

| 区块 | 已完成 | 进行中 | 未开始 |
|------|--------|--------|--------|
| 包落地 | 4 | 0 | 0 |
| 阶段 1–5 | 1（阶段1）+ 1（阶段2最小DOM）+ 0.7（阶段3组件基础） | 0 | 其余阶段 |
| 测试 §9.2 | 1（核心单测） | 0 | 其余 |

*实施过程中请在本文件中勾选 `[ ]` 并在 [todo.md](./todo.md) 或 PR 中保留对应变更说明。*
