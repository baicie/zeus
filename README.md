# Zeus

Zeus 是一个 compiler-first、基于细粒度响应式、无 Virtual DOM 的前端 UI 框架。

## 核心目标

- JSX 开发体验
- 编译期模板提升
- 运行时细粒度 DOM 更新
- `state()` 统一状态入口（Phase 1 实现）
- 保留对象、数组、Map、Set 的引用类型响应式能力
- 编译为 Web Components 支持（远期目标）

## 安装

```bash
pnpm install
```

## 开发命令

```bash
pnpm build      # 构建所有核心包
pnpm check      # 类型检查
pnpm lint       # 代码检查
pnpm test       # 所有测试
pnpm dev        # watch build
```

## Packages

- `@zeus-js/signal` — 响应式信号系统
- `@zeus-js/shared` — 共享工具函数
- `@zeus-js/runtime-dom` — DOM runtime helpers
- `@zeus-js/compiler` — JSX 编译器（IR-first 架构）
- `@zeus-js/zeus` — 统一入口包

## 状态 API（Phase 1）

主推 API：

```ts
state()       // 统一状态入口
computed()   // 派生计算
effect()     // 副作用
watch()      // 监听
scope()      // 作用域
```

底层兼容 API（不作为主文档推荐）：

```ts
ref()        // 响应式引用
reactive()   // 对象响应式代理
```

DOM ref 使用 JSX ref 协议：

```tsx
const input = state<HTMLInputElement | null>(null)
return <input ref={input} />
```

## License

MIT
