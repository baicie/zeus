# Roadmap

## 整体路线

```
Phase 0：项目基线与框架定位     ✅ 进行中
Phase 1：Unified State API + Reactivity Core
Phase 2：Runtime DOM MVP
Phase 3：Compiler MVP 闭环
Phase 4：Vite 插件与框架入口
Phase 5：Host / Slot / Web Components
Phase 6：性能优化
Phase 7：文档、生态、发布
```

## Phase 0：项目基线与框架定位

- [x] README 定位更新
- [x] 统一包导出规范（runtime-dom + zeus 接入 buildOptions）
- [x] 统一构建体系（rolldown 统一构建 5 个核心包）
- [ ] docs/roadmap.md
- [ ] docs/rfc/0001-reactivity-api.md
- [ ] 明确 Phase 1 的 API 方向：state() 统一状态入口
- [ ] 验收：pnpm build / check / test 全通过

## Phase 1：Unified State API + Reactivity Core

- [ ] `state()` 统一状态入口实现
- [ ] `scope()` 作用域 API
- [ ] JSX ref runtime 支持
- [ ] JSX ref compiler 支持
- [ ] 响应式测试补齐

## Phase 2：Runtime DOM MVP

- [ ] render 函数完善
- [ ] Show/For 完善（reactive cleanup）
- [ ] bindText/bindAttr/bindEvent/bindProp
- [ ] delegateEvents runtime
- [ ] Show fallback 路径

## Phase 3：Compiler MVP 闭环

- [ ] JSX → IR lower 收尾
- [ ] IR → DOM codegen 收尾
- [ ] RefBindingIR 实现
- [ ] Show/For 端到端编译测试
- [ ] 端到端 TSX → DOM 渲染测试

## Phase 4：Vite 插件与框架入口

- [ ] `packages/vite-plugin` 包
- [ ] `.tsx` 编译接入
- [ ] 开发期诊断信息
- [ ] 基础 HMR 支持
- [ ] `@zeus-js/zeus` 统一入口完善

## Phase 5：Host / Slot / Web Components

- [ ] defineElement 完善
- [ ] Host 编译 + runtime
- [ ] Slot 编译 + runtime（Shadow DOM）
- [ ] Light DOM slot 投影
- [ ] prop 反射完善

## Phase 6：性能优化

- [ ] For key reconciliation
- [ ] 列表节点复用
- [ ] 事件委托（delegateEvents）
- [ ] @once 静态标记
- [ ] classList/style 绑定优化

## Phase 7：文档、生态、发布

- [ ] 完整 API 文档
- [ ] 迁移指南
- [ ] playground 完善
- [ ] 首个正式版本发布
