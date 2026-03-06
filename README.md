# Zeus

现代化的前端框架，基于 SolidJS 风格的细粒度响应式编译。

## 特性

- **细粒度响应式**: 无需 Virtual DOM，直接追踪状态变化
- **高性能**: 编译时优化，生成高效的 DOM 操作代码
- **TypeScript 支持**: 完整的类型推导
- **DX 友好**: 类似 React 的开发体验

## 架构

Zeus 是一个基于 pnpm workspace 的 monorepo 项目，使用 TypeScript 和 Rust 混合开发：

### Rust Crates

- `compiler-core`: 核心编译器
- `compiler-dom`: DOM 编译
- `compiler-ssr`: 服务端渲染编译
- `zeusjs_binding`: NAPI-RS 绑定

### TypeScript Packages

- `runtime-core`: 核心运行时
- `runtime-dom`: DOM 渲染器
- `signal`: 响应式信号系统
- `shared`: 共享工具

## 安装

```bash
pnpm install
```

## 开发命令

```bash
# 开发模式
pnpm dev

# 构建
pnpm build

# 测试
pnpm test

# 类型检查
pnpm check

# 代码检查
pnpm lint
```

## 快速开始

```tsx
import { createSignal, render } from '@zeus-js/runtime-dom'

const App = () => {
  const [count, setCount] = createSignal(0)

  return (
    <div>
      <h1>Count: {count()}</h1>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  )
}

render(document.getElementById('app'), <App />)
```

## License

MIT
