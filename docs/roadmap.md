# Zeus Roadmap

## 项目定位

**Zeus** 是一个 compiler-first、无 Virtual DOM、基于细粒度响应式的前端 UI 框架。

核心特征：
- JSX 编译到精确 DOM 操作
- 组件只初始化一次，不 rerender
- 细粒度响应式驱动 DOM 更新
- Web Components (Host / Slot) 一等支持
- 长期目标：Rust 编译器后端

## 7 个 Phase

```
Phase 0：项目基线与框架定位      ← 当前
Phase 1：Unified State API + Reactivity Core
Phase 2：Runtime DOM MVP
Phase 3：Compiler MVP 闭环
Phase 4：Vite 插件与框架入口
Phase 5：Host / Slot / Web Components
Phase 6：性能优化
Phase 7：文档、生态、发布
```

---

## Phase 0：项目基线与框架定位

**目标：把 Zeus 从"响应式实验仓库"整理成"可持续演进的框架 monorepo"。**

### 已完成

- [x] README 定位更新
- [x] 统一包导出规范
- [x] 统一构建体系（rolldown）
- [x] 目录结构规范（packages/signal, runtime-dom, compiler, shared, zeus）
- [x] 测试结构规范（`__tests__/*.spec.ts`）
- [x] RFC-0001: 响应式 API 命名决策

### Phase 0 核心决策

#### 响应式语义

- 内部依赖 **alien-signal**
- 对外不直接暴露 alien-signal
- Zeus 提供公共 API：`createSignal` / `createMemo` / `createEffect` / `createRoot` / `onCleanup` / `batch`
- 长期探索 `state()` 统一状态入口

#### 更新模型

- 组件函数只在初始化时执行
- 后续更新不 rerender 组件
- DOM 更新由 signal/effect 驱动

#### JSX 编译范围（MVP）

- 原生 DOM 标签
- 普通组件
- 文本插值、动态属性、事件
- Fragment、Show、For

#### Web Components 策略

- Zeus 组件支持编译为 Custom Element
- `Host` / `Slot` 是编译期内置节点

#### MVP 非目标

- SSR / Hydration
- Router / Store 全家桶
- Suspense / Resource
- 激进响应式语法糖（`$state` 等）
- Rust 编译器正式版

---

## Phase 1：Unified State API + Reactivity Core

### 目标交付物

- `createSignal()` / `createMemo()` / `createEffect()` / `createRoot()` / `onCleanup()` / `batch()`
- owner / scope / dispose 机制
- JSX ref runtime + compiler 支持

### 详细计划

见 [`design/phase1.md`](./design/phase1.md)。

---

## Phase 2：Runtime DOM MVP

### 目标交付物

- `render()` 函数
- `bindText` / `bindAttr` / `bindProp` / `bindEvent`
- `Show` / `For` 完善（reactive cleanup）
- delegateEvents runtime

### 详细计划

见 [`design/phase2.md`](./design/phase2.md)。

---

## Phase 3：Compiler MVP 闭环

### 目标交付物

- JSX → IR lower
- IR → DOM codegen
- RefBindingIR 实现
- Show / For 端到端编译测试
- 端到端 TSX → DOM 渲染测试

### 详细计划

见 [`mvp-1-5-runtime-dom-compiler-plan.md`](./mvp-1-5-runtime-dom-compiler-plan.md)。

---

## Phase 4：Vite 插件与框架入口

### 目标交付物

- `packages/vite-plugin-zeus`
- `.tsx` 编译接入
- 开发期诊断信息
- 基础 HMR 支持
- `@zeus-js/zeus` 统一入口完善

---

## Phase 5：Host / Slot / Web Components

### 目标交付物

- `defineElement` 完善
- `Host` 编译 + runtime
- `Slot` 编译 + runtime（Shadow DOM）
- Light DOM slot 投影
- prop 反射完善

### 详细设计

见 [`compiler-ir-first-architecture-plan.md`](./compiler-ir-first-architecture-plan.md)（Section 8-9）。

---

## Phase 6：性能优化

### 可做项

- For key reconciliation
- 列表节点复用
- 事件委托（delegateEvents）
- `@once` 静态标记
- classList / style 绑定优化

---

## Phase 7：文档、生态、发布

- 完整 API 文档
- 迁移指南
- playground 完善
- 首个正式版本发布

---

## 参考文档

| 文档 | 内容 |
|------|------|
| [`AGENTS.md`](../AGENTS.md) | 产品方向、架构约束与实现规则（中文，框架宪法） |
| [`compiler-ir-first-architecture-plan.md`](./compiler-ir-first-architecture-plan.md) | 编译器 IR-first 架构详细方案 |
| [`mvp-1-5-runtime-dom-compiler-plan.md`](./mvp-1-5-runtime-dom-compiler-plan.md) | MVP-1.5 runtime-dom 与 compiler binding 闭环计划 |
| [`future-architecture-roadmap.md`](./future-architecture-roadmap.md) | 远期架构路线图（SSR / Rust / HMR / Devtools） |
| [`design/phase1.md`](./design/phase1.md) | Phase 1 详细设计草案（Unified State API） |
| [`design/phase2.md`](./design/phase2.md) | Phase 2 详细设计草案（Runtime DOM MVP） |
| [`rfc/0001-reactivity-api.md`](./rfc/0001-reactivity-api.md) | RFC-0001：响应式 API 命名决策 |
| [`reference/dom-expressions/README.md`](./reference/dom-expressions/README.md) | dom-expressions 参考文档索引 |
| [`test-structure.md`](./test-structure.md) | 测试结构规范 |
| [`reference/optimization-report-2026-05-15.md`](./reference/optimization-report-2026-05-15.md) | 优化变更记录 |
| [`reference/vue3-babel-ir-analysis.md`](./reference/vue3-babel-ir-analysis.md) | Vue 3 编译器 Babel / IR 使用分析 |
| [`reference/solidjs-compiler-reference.md`](./reference/solidjs-compiler-reference.md) | SolidJS 编译器参考路径 |
