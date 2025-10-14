# 框架核心功能 MVP TODO

## 阶段 1：基础 Web Component + Runtime

- [x] **Runtime 基础结构** - `packages/runtime/`
  - [x] 响应式系统集成 (`alien-signals`) - `packages/runtime/src/index.ts`
  - [x] DOM 操作工具：createElement / insertText / setAttr / mount/unmount - `packages/runtime/src/dom-helper.ts`
- [ ] **Web Components 基类** - `packages/wc/`
  - [ ] ShadowRoot 支持 - `packages/wc/src/base.ts` (`AlienElement`)
  - [ ] Light DOM 支持 - `packages/wc/src/base.ts` (`AlienLightElement`)
  - [ ] 装饰器系统 - `packages/wc/src/decorators.ts`
    - [ ] `@defineElement` / `@defineLightElement`
    - [ ] `@defineAttribute` / `@defineEvent`
    - [ ] `@observeAttributes`
    - [ ] 生命周期装饰器 (`lifecycle.created/connected/disconnected`)
- [ ] 模板 clone + 静态 DOM 缓存
- [ ] 条件渲染 / 列表渲染（基础版）
- [ ] Event binding + delegateEvents（基础版）

## 阶段 2：JSX 编译器

- [ ] **编译器基础结构** - `packages/compiler/`
  - [ ] 包配置和依赖 - `packages/compiler/package.json`
  - [ ] TSX/JSX → IR（中间表示）
  - [ ] IR → Web Component 输出
  - [ ] 支持指令级更新（文本 / 属性 / class / style）
  - [ ] 事件绑定 IR 生成（onClick → runtime handler）
  - [ ] slot / props 信息提取

## 阶段 3：内置组件库

- [ ] **组件库基础结构** - `packages/components/`
  - [ ] 包配置 - `packages/components/package.json`
  - [ ] 基础组件 Button / Input / Checkbox / Select
  - [ ] 所有组件使用 TSX + signal + JSX 编译器
  - [ ] ShadowRoot / Light DOM 渲染测试
  - [ ] 响应式更新测试（文本 / 属性 / class / style）

## 阶段 4：多框架适配器（adapter）

- [ ] **适配器基础结构** - `packages/adapters/` (待创建)
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

- [ ] **Vite 插件** - `tools/vite-plugin-zeus/`
  - [ ] 插件基础结构 - `tools/vite-plugin-zeus/src/index.ts`
  - [ ] 代码转换逻辑 - `tools/vite-plugin-zeus/src/transform.ts`
  - [ ] 选项配置 - `tools/vite-plugin-zeus/src/options.ts`
  - [ ] HMR 支持 - `tools/vite-plugin-zeus/src/hmr.ts`
  - [ ] 工具函数 - `tools/vite-plugin-zeus/src/utils.ts`
  - [ ] 包配置和构建 - `tools/vite-plugin-zeus/package.json`
- [ ] **构建配置**
  - [ ] Rollup / esbuild 配置
    - Web Component 输出
    - Adapter 输出（React/Vue）
- [ ] **发布流程**
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

## 📊 当前实现状态

### ✅ 已完成 (约 40%)

1. **Runtime 基础** - `packages/runtime/`

- ✅ 响应式系统集成 (`alien-signals`)
- ✅ DOM 操作工具 (完整的 createElement API 集)

2. **Web Components 基类** - `packages/wc/`
   - ✅ Shadow DOM 和 Light DOM 基类
   - ✅ 完整的装饰器系统
   - ✅ 生命周期管理

3. **Vite 插件** - `tools/vite-plugin-zeus/`
   - ✅ 完整的插件架构
   - ✅ 代码转换和 HMR 支持
   - ✅ 配置选项和工具函数

### 🔄 进行中 (约 20%)

1. **编译器** - `packages/compiler/`
   - ✅ 包配置和依赖
   - ❌ JSX/TSX 编译逻辑

2. **组件库** - `packages/components/`
   - ✅ 包配置
   - ❌ 具体组件实现

### ⏳ 待开始 (约 40%)

1. **多框架适配器** - `packages/adapters/`
2. **构建和发布流程**
3. **示例和文档**

---

## 核心原则

1. 核心逻辑只在 **Web Component + runtime** 内部
2. **JSX 编译器 + IR** 解耦逻辑和输出
3. **多框架 adapter** 轻量封装，仅映射 props 和事件
4. **阶段 MVP** 先保证可运行、可扩展，再优化性能和特性
