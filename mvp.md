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

## Monorepo 架构

```
frontend-framework/
├── packages/
│   ├── signal/                    # 响应式核心
│   │   ├── src/
│   │   │   ├── core/             # 基于 alien-signal 的核心实现
│   │   │   ├── reactivity/       # 响应式 API
│   │   │   └── utils/
│   │   └── package.json
│   ├── runtime-core/             # 运行时核心
│   │   ├── src/
│   │   │   ├── component/        # 组件系统
│   │   │   ├── lifecycle/        # 生命周期
│   │   │   ├── context/          # 上下文系统
│   │   │   └── scheduler/        # 调度器
│   │   └── package.json
│   ├── runtime-dom/              # DOM 运行时
│   │   ├── src/
│   │   │   ├── renderer/         # DOM 渲染器
│   │   │   ├── directives/       # 指令系统
│   │   │   └── events/           # 事件处理
│   │   └── package.json
│   ├── compiler-core/            # 编译器核心 (Rust + NAPI)
│   │   ├── src/                  # Rust 源码
│   │   ├── native/               # NAPI 绑定
│   │   └── package.json
│   ├── compiler-dom/             # DOM 编译器
│   │   ├── src/
│   │   │   ├── transforms/       # 转换逻辑
│   │   │   └── generators/       # 代码生成
│   │   └── package.json
│   ├── ssr/                      # 服务端渲染
│   │   ├── src/
│   │   │   ├── renderer/         # SSR 渲染器
│   │   │   └── hydration/        # 水合逻辑
│   │   └── package.json
│   └── web-components/           # Web Components 支持
│       ├── src/
│       │   ├── adapter/          # 适配器
│       │   └── registry/         # 组件注册
│       └── package.json
├── tools/                        # 构建工具
├── examples/                     # 示例
├── docs/                         # 文档
├── package.json                  # 根配置
└── pnpm-workspace.yaml
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

// 类型定义
export interface Signal<T> {
  (): T
  (value: T): T
  readonly value: T
}

export interface Effect {
  destroy(): void
}
```

### 使用示例

```typescript
import { signal, computed, effect } from '@framework/signal'

const count = signal(0)
const double = computed(() => count() * 2)

effect(() => {
  console.log(`Count: ${count()}, Double: ${double()}`)
})

count(1) // 触发响应式更新
```

## Runtime-Core 运行时核心

### 组件系统

```typescript
// packages/runtime-core/src/component/index.ts

export interface Component {
  setup?: (props: any) => () => Element | DocumentFragment
  render?: () => Element | DocumentFragment
  mounted?: () => void
  updated?: () => void
  unmounted?: () => void
}

export function defineComponent(component: Component): Component
export function createApp(rootComponent: Component): App

export interface App {
  mount(container: Element | string): void
  unmount(): void
}
```

### 生命周期 API

```typescript
// packages/runtime-core/src/lifecycle/index.ts

export function onMounted(callback: () => void): void
export function onUpdated(callback: () => void): void
export function onUnmounted(callback: () => void): void
export function onBeforeMount(callback: () => void): void
export function onBeforeUpdate(callback: () => void): void
export function onBeforeUnmount(callback: () => void): void

// 内部实现
export function createLifecycleHooks(): LifecycleHooks
```

### Context API

```typescript
// packages/runtime-core/src/context/index.ts

export interface Context<T> {
  Provider: Component
  Consumer: Component
  defaultValue: T
}

export function createContext<T>(defaultValue: T): Context<T>
export function useContext<T>(context: Context<T>): T
export function provide<T>(key: symbol | string, value: T): void
export function inject<T>(key: symbol | string, defaultValue?: T): T
```

### 调度器

```typescript
// packages/runtime-core/src/scheduler/index.ts

export function nextTick(callback: () => void): Promise<void>
export function queueJob(job: () => void): void
export function queuePostFlushCb(callback: () => void): void
```

## Runtime-DOM DOM 运行时

### 渲染器 API

```typescript
// packages/runtime-dom/src/renderer/index.ts

export interface RendererOptions {
  createElement: (tag: string) => Element
  createText: (text: string) => Text
  createComment: (text: string) => Comment
  insert: (child: Node, parent: Node, anchor?: Node) => void
  remove: (child: Node) => void
  setElementText: (el: Element, text: string) => void
  setText: (node: Text, text: string) => void
  patchProp: (el: Element, key: string, prevValue: any, nextValue: any) => void
}

export function createRenderer(options: RendererOptions): Renderer
```

### DOM 操作 API

```typescript
// packages/runtime-dom/src/dom/index.ts

export function createElement(
  tag: string,
  props?: any,
  ...children: any[]
): Element
export function createText(text: string): Text
export function createFragment(children: (Element | Text)[]): DocumentFragment

// 指令系统
export function withDirectives(
  element: Element,
  directives: Directive[],
): Element
export interface Directive {
  mounted?: (el: Element, binding: DirectiveBinding) => void
  updated?: (el: Element, binding: DirectiveBinding) => void
  unmounted?: (el: Element) => void
}
```

## Compiler 编译器设计

### Rust + NAPI 架构

```rust
// packages/compiler-core/src/lib.rs

use oxc::{parser::Parser, allocator::Allocator, ast::ast::Program};
use napi_derive::napi;

#[napi]
pub struct Compiler {
  options: CompileOptions,
}

#[napi]
impl Compiler {
  #[napi(constructor)]
  pub fn new(options: CompileOptions) -> Self {
    Self { options }
  }

  #[napi]
  pub fn compile(&self, source: String) -> Result<CompileResult, String> {
    // 使用 oxc 解析 JSX/TSX
    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, &source, /* options */);
    let program = parser.parse().program;

    // 转换逻辑
    let transformed = self.transform(program)?;

    // 生成代码
    let code = self.generate(transformed)?;

    Ok(CompileResult { code, map: None })
  }

  fn transform(&self, program: Program) -> Result<TransformedProgram, String> {
    // 类似 SolidJS 的转换逻辑
    // JSX -> 直接 DOM API 调用，无虚拟 DOM 中间层
    // 响应式优化：精确依赖追踪，避免不必要的 DOM 操作
  }

  fn generate(&self, program: TransformedProgram) -> Result<String, String> {
    // 生成最终代码
  }
}
```

### 编译转换规则

参考 SolidJS 的编译策略：

1. **JSX 转换**：`<div>{signal()}</div>` → 直接 DOM API 调用，无中间抽象层
2. **响应式优化**：自动检测响应式依赖，精确控制 DOM 更新
3. **组件转换**：函数组件 → 直接函数调用，返回真实 DOM 元素
4. **条件渲染**：`{condition && <Comp />}` → `condition ? Comp() : null`，直接操作真实 DOM

## 组件使用示例

```tsx
// 定义组件
function Counter() {
  const count = signal(0)
  const increment = () => count(count() + 1)

  return () => {
    const div = document.createElement('div')
    const h1 = document.createElement('h1')
    const button = document.createElement('button')

    // 响应式绑定：count 变化时自动更新文本
    effect(() => {
      h1.textContent = `Count: ${count()}`
    })

    button.textContent = '+'
    button.addEventListener('click', increment)

    div.appendChild(h1)
    div.appendChild(button)

    return div
  }
}

// 或者直接定义为返回 DOM 的函数
const SimpleCounter = () => {
  const count = signal(0)
  const increment = () => count(count() + 1)

  const div = document.createElement('div')
  const h1 = document.createElement('h1')
  const button = document.createElement('button')

  // 响应式绑定：count 变化时自动更新文本
  effect(() => {
    h1.textContent = `Count: ${count()}`
  })

  button.textContent = '+'
  button.addEventListener('click', increment)

  div.appendChild(h1)
  div.appendChild(button)

  return div
}

// 使用组件
function App() {
  return () => {
    const div = document.createElement('div')
    div.appendChild(Counter()())
    return div
  }
}

// 挂载应用
const app = createApp(App)
app.mount('#app')
```

## 优化建议

### 1. 性能优化

- **细粒度更新**：基于 signal 的精确依赖追踪
- **编译时优化**：通过编译器进行静态分析和优化
- **懒加载**：支持组件和模块的懒加载

### 2. 开发体验

- **TypeScript 支持**：完整的类型定义和推导
- **热重载**：开发时的快速更新
- **调试工具**：响应式依赖图可视化

### 3. 生态系统

- **插件系统**：支持自定义编译转换
- **中间件**：支持自定义渲染器
- **工具链集成**：Vite、Webpack 等构建工具支持

### 4. 架构优化

- **渐进式增强**：从小 MVP 开始，逐步添加功能
- **模块化设计**：保持包之间的松耦合
- **测试策略**：单元测试 + 集成测试 + E2E 测试

## 实现优先级

### MVP (最小可用版本)

1. ✅ signal 响应式核心
2. ✅ runtime-core 基础组件系统
3. ✅ runtime-dom 基础 DOM 渲染
4. ✅ compiler-core JSX/TSX 编译
5. ✅ 基础生命周期支持

### 后续版本

1. Context API 完善
2. 指令系统
3. SSR 支持
4. Web Components 适配
5. 高级编译优化
6. 开发工具生态

## 技术挑战

1. **编译器性能**：Rust + oxc 的集成和优化
2. **类型安全**：TSX/JSX 的类型推导
3. **运行时优化**：最小化运行时开销
4. **生态兼容**：与现有工具链的集成

## 参考资料

- [SolidJS](https://github.com/solidjs/solid) - 编译时响应式框架
- [alien-signals](https://github.com/stackblitz/alien-signals) - 轻量级响应式库
- [oxc](https://github.com/oxc-project/oxc) - 高性能 JS/TS 解析器
- [NAPI-RS](https://napi.rs/) - Rust 与 Node.js 绑定
