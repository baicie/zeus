# 框架核心功能 MVP TODO

## 阶段 1：基础 Web Component + Runtime

- [ ] DOM 操作工具：createElement / insertText / setAttr / mount/unmount
- [ ] ShadowRoot / Light DOM 支持
- [ ] 模板 clone + 静态 DOM 缓存
- [ ] 条件渲染 / 列表渲染（基础版）
- [ ] Event binding + delegateEvents（基础版）

## 阶段 2：JSX 编译器

- [ ] TSX/JSX → IR（中间表示）
- [ ] IR → Web Component 输出
- [ ] 支持指令级更新（文本 / 属性 / class / style）
- [ ] 事件绑定 IR 生成（onClick → runtime handler）
- [ ] slot / props 信息提取

## 阶段 3：内置组件库

- [ ] 基础组件 Button / Input / Checkbox / Select
- [ ] 所有组件使用 TSX + signal + JSX 编译器
- [ ] ShadowRoot / Light DOM 渲染测试
- [ ] 响应式更新测试（文本 / 属性 / class / style）

## 阶段 4：多框架适配器（adapter）

- [ ] React adapter
  - props 映射
  - 事件映射
- [ ] Vue adapter
  - props 映射
  - v-model / emit 映射
- [ ] Svelte adapter（可选）
  - props 映射
  - 事件映射
- [ ] 确保 adapter 轻量，只做映射，无响应式逻辑

## 阶段 5：构建与发布

- [ ] Rollup / esbuild 配置
  - Web Component 输出
  - Adapter 输出（React/Vue）
- [ ] Monorepo CI 构建脚本
- [ ] 发布到 npm，支持多目标包
- [ ] Examples / Playground 项目

## 阶段 6：优化 & 高级特性

- [ ] 条件渲染 / 列表渲染优化
- [ ] Event delegate 完整实现（ShadowRoot / Light DOM）
- [ ] slot / scoped style 支持
- [ ] SSR / tree-shaking 支持
- [ ] 文档 & API 注释完善

---

## 核心原则

1. 核心逻辑只在 **Web Component + runtime** 内部
2. **JSX 编译器 + IR** 解耦逻辑和输出
3. **多框架 adapter** 轻量封装，仅映射 props 和事件
4. **阶段 MVP** 先保证可运行、可扩展，再优化性能和特性
