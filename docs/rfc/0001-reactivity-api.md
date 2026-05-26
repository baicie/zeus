# RFC 0001: Reactivity API Naming

## 状态

已批准（Phase 0 决策）

## 背景

Zeus 需要在 Phase 1 实现统一的状态 API。在此之前，代码库里存在多套命名并存的现状：`ref` / `reactive` / `state` / `domRef`，导致 API 定位不清。

本 RFC 旨在明确公共 API 命名策略，为 Phase 1 实现 `state()` 统一状态入口扫清障碍。

## 决策

### 主推 API（文档默认推荐）

```ts
state()      // 统一状态入口，对应 Vue 的 ref() + reactive() 统一方向
computed()   // 派生计算
effect()     // 副作用
watch()      // 监听
scope()      // 作用域
```

### 底层兼容 API（保留但不在主文档推荐）

```ts
ref()        // 响应式引用，兼容 Vue 风格
reactive()   // 对象响应式代理
```

这些 API 保留是为了：
1. 降低已有 Vue/Solid 经验的开发者迁移成本
2. 内部实现复用（`state()` 底层可能基于 `ref()` 实现）

### DOM ref 协议

DOM ref 使用 **JSX ref 属性协议**，不单独提供 `domRef()` 函数：

```tsx
const input = state<HTMLInputElement | null>(null)

return <input ref={input} />
```

编译器将 `ref={input}` 编译为运行时绑定，不产生 RefBindingIR 以外的额外节点。

### 不作为公共 API 的命名

以下命名不在公共 API 范围内：

- `cell()` — 不提供
- `domRef()` — 使用 JSX ref 协议代替
- `useState()` — React 风格，不采用

## 实现计划

Phase 1 将实现 `state()`，其语义为：

```ts
// 基本用法（类似 ref）
const count = state(0)
count.value++

// 对象用法（类似 reactive）
const obj = state({ name: 'zeus' })
obj.name = 'new name'
```

`ref()` 和 `reactive()` 保持为底层 API，内部可基于 alien-signals 实现。

## 影响范围

本决策影响：

- `@zeus-js/signal` 的导出命名
- `@zeus-js/zeus` 的统一入口导出
- 文档和 playground 示例代码

不影响：

- `@zeus-js/compiler` 的 IR 设计
- `@zeus-js/runtime-dom` 的 DOM helpers
