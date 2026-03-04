# 前端框架 MVP 设计文档

## 概述

设计一个轻量级前端框架，支持 TSX/JSX 语法，**真正无虚拟 DOM**，函数式编程。采用 monorepo 架构，使用 Rust + NAPI 进行编译器开发，基于 alien-signal/runtime 实现响应式系统。

**核心理念**：

- 摒弃虚拟 DOM，直接操作真实 DOM
- 组件返回真实 DOM 元素或 DocumentFragment
- 通过编译时优化实现精确的响应式更新
- 最小化运行时开销，最大化性能

## 技术栈

- **响应式核心**: alien-signal/runtime (轻量级设计)
- **编译器**: Rust + NAPI + oxc (语法解析和代码生成)
- **编译参考**: SolidJS 编译器实现
- **架构**: Monorepo + pnpm workspace
- **语言**: TypeScript + Rust
- **特性**:
  - ✅ TSX/JSX 支持
  - ✅ **真正无虚拟 DOM**（直接操作真实 DOM）
  - ✅ 函数式编程
  - ✅ 编译时响应式优化

## 进度追踪 (Progress Tracking)

### 编译器 (Rust Crates)

- [x] **compiler-core**: 核心编译逻辑，AST 解析 (Rust + oxc)
- [x] **compiler-dom**: DOM 特定转换，JSX -> DOM (Rust + oxc)
  - [x] 实现 JSX AST 转换器
  - [x] 实现 `document.createElement` 等 DOM API 生成
  - [x] 单元测试验证转换逻辑
- [x] **zeusjs_binding**: Node.js NAPI 绑定
  - [x] 暴露 `compiler` 函数
  - [x] 集成 `compiler-dom`
- [x] **runtime-core (Rust)**: 实验性 Rust 运行时核心 (VNode结构)

### 运行时 (TypeScript Packages)

- [ ] **signal**: 响应式系统实现
- [ ] **runtime-core**: 运行时核心 (组件, 生命周期)
- [ ] **runtime-dom**: DOM 操作封装

## Monorepo 架构

```
frontend-framework/
├── packages/                 # TypeScript 包
│   ├── signal/               # 响应式核心
│   ├── runtime-core/         # 运行时核心 (TS)
│   ├── runtime-dom/          # DOM 运行时 (TS)
│   └── ...
├── crates/                   # Rust Crates
│   ├── compiler-core/        # 编译器核心
│   ├── compiler-dom/         # DOM 编译器
│   ├── zeusjs_binding/       # NAPI 绑定
│   └── runtime-core/         # Rust 运行时 (WASM/SSR预留)
└── ...
```

## Signal 响应式系统

基于 alien-signal/runtime 的轻量级响应式实现。

### 核心 API

```typescript
// packages/signal/src/reactivity/index.ts

// 响应式原语
export function signal<T>(initialValue: T): Signal<T>
export function computed<T>(fn: () => T): ReadonlySignal<T>
export function effect(fn: () => void): Effect

// 批量更新
export function batch<T>(fn: () => T): T

// 观察者模式
export function observe<T>(
  signal: Signal<T>,
  callback: (value: T) => void,
): () => void
```

1. ts编译报错
2. 编译结果优化沿用之前的方案
3. 编译报错优化给出行列号
