# Alien-Signals 框架 MVP 路线图

## 🎯 项目目标

Alien-Signals 是一个基于响应式内核的现代前端框架，具有以下核心特性：

- **响应式内核**：基于 signals 的细粒度响应式系统
- **JSX 语法**：支持 JSX 语法，提供熟悉的开发体验
- **无虚拟 DOM**：直接操作真实 DOM，提升性能
- **Web Components 支持**：原生支持 Web Components（light DOM 模式）
- **轻量级**：极小的运行时体积，高性能

## 📋 MVP 功能范围

### Phase 1: 核心响应式系统 (Week 1-2)

#### 1.1 Signals 响应式内核

```typescript
// packages/runtime/src/signals.ts
export class Signal<T> {
  private _value: T
  private _subscribers = new Set<() => void>()

  constructor(initialValue: T) {
    this._value = initialValue
  }

  get value(): T {
    return this._value
  }

  set value(newValue: T) {
    if (this._value !== newValue) {
      this._value = newValue
      this._notify()
    }
  }

  subscribe(fn: () => void): () => void {
    this._subscribers.add(fn)
    return () => this._subscribers.delete(fn)
  }

  private _notify() {
    this._subscribers.forEach(fn => fn())
  }
}

export function createSignal<T>(
  initialValue: T,
): [() => T, (value: T) => void] {
  const signal = new Signal(initialValue)
  return [
    () => signal.value,
    (value: T) => {
      signal.value = value
    },
  ]
}
```

#### 1.2 计算属性 (Computed)

```typescript
// packages/runtime/src/computed.ts
export class Computed<T> {
  private _value: T
  private _fn: () => T
  private _dependencies = new Set<Signal<any>>()
  private _isDirty = true

  constructor(fn: () => T) {
    this._fn = fn
    this._value = fn()
  }

  get value(): T {
    if (this._isDirty) {
      this._update()
    }
    return this._value
  }

  private _update() {
    this._value = this._fn()
    this._isDirty = false
  }
}

export function createComputed<T>(fn: () => T): () => T {
  const computed = new Computed(fn)
  return () => computed.value
}
```

#### 1.3 副作用 (Effects)

```typescript
// packages/runtime/src/effects.ts
export function createEffect(fn: () => void): () => void {
  let cleanup: (() => void) | undefined

  const effect = () => {
    if (cleanup) cleanup()
    cleanup = fn()
  }

  effect()
  return () => {
    if (cleanup) cleanup()
  }
}
```

### Phase 2: JSX 编译器和运行时 (Week 3-4)

#### 2.1 JSX 编译器

```typescript
// packages/compiler/src/jsx.ts
export function jsx(type: string | Function, props: any, ...children: any[]) {
  if (typeof type === 'function') {
    return type({ ...props, children })
  }

  return {
    type: 'element',
    tag: type,
    props: props || {},
    children: children.flat(),
  }
}

export function jsxs(type: string | Function, props: any, children: any[]) {
  return jsx(type, props, ...children)
}
```

#### 2.2 渲染器

```typescript
// packages/runtime/src/renderer.ts
export function render(vnode: any, container: Element) {
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    container.textContent = String(vnode)
    return
  }

  if (vnode.type === 'element') {
    const element = document.createElement(vnode.tag)

    // 处理属性
    Object.entries(vnode.props).forEach(([key, value]) => {
      if (key === 'children') return

      if (key.startsWith('on')) {
        const eventName = key.toLowerCase().slice(2)
        element.addEventListener(eventName, value)
      } else {
        element.setAttribute(key, String(value))
      }
    })

    // 处理子元素
    vnode.children.forEach((child: any) => {
      render(child, element)
    })

    container.appendChild(element)
  }
}
```

### Phase 3: 响应式组件系统 (Week 5-6)

#### 3.1 组件基类

```typescript
// packages/runtime/src/component.ts
export abstract class Component {
  protected element: Element | null = null
  protected effects: (() => void)[] = []

  abstract render(): any

  mount(container: Element) {
    this.element = container
    this.update()
  }

  protected update() {
    if (!this.element) return

    // 清理旧的内容
    this.element.innerHTML = ''

    // 渲染新内容
    const vnode = this.render()
    render(vnode, this.element)
  }

  protected createEffect(fn: () => void) {
    const cleanup = createEffect(fn)
    this.effects.push(cleanup)
  }

  destroy() {
    this.effects.forEach(cleanup => cleanup())
    this.effects = []
    this.element = null
  }
}
```

#### 3.2 函数式组件支持

```typescript
// packages/runtime/src/functional.ts
export function createComponent(fn: (props: any) => any) {
  return class FunctionalComponent extends Component {
    private props: any

    constructor(props: any) {
      super()
      this.props = props
    }

    render() {
      return fn(this.props)
    }
  }
}
```

### Phase 4: Web Components 集成 (Week 7-8)

#### 4.1 Web Components 基类

```typescript
// packages/wc/src/base.ts
export class AlienElement extends HTMLElement {
  protected component: Component | null = null
  protected shadow: ShadowRoot

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.component = this.createComponent()
    this.component.mount(this.shadow)
  }

  disconnectedCallback() {
    if (this.component) {
      this.component.destroy()
      this.component = null
    }
  }

  protected abstract createComponent(): Component
}
```

#### 4.2 装饰器支持

```typescript
// packages/wc/src/decorators.ts
export function defineElement(tagName: string) {
  return function (constructor: typeof AlienElement) {
    customElements.define(tagName, constructor)
  }
}

export function defineComponent(componentClass: typeof Component) {
  return function (target: any, propertyKey: string) {
    target.createComponent = () => new componentClass()
  }
}
```

### Phase 5: 开发工具和优化 (Week 9-10)

#### 5.1 开发工具

```typescript
// packages/devtools/src/index.ts
export class DevTools {
  static trackSignal(signal: Signal<any>, name: string) {
    // 信号追踪逻辑
  }

  static trackComponent(component: Component, name: string) {
    // 组件追踪逻辑
  }

  static getPerformanceMetrics() {
    // 性能指标收集
  }
}
```

#### 5.2 构建优化

```typescript
// packages/compiler/src/optimizer.ts
export function optimizeBundle(code: string): string {
  // Tree shaking
  // 代码压缩
  // 依赖分析
  return code
}
```

## 🏗️ 项目结构

```
packages/
├── runtime/           # 核心运行时
│   ├── src/
│   │   ├── signals.ts
│   │   ├── computed.ts
│   │   ├── effects.ts
│   │   ├── component.ts
│   │   ├── renderer.ts
│   │   └── index.ts
│   └── package.json
├── compiler/          # JSX 编译器
│   ├── src/
│   │   ├── jsx.ts
│   │   ├── optimizer.ts
│   │   └── index.ts
│   └── package.json
├── wc/               # Web Components 支持
│   ├── src/
│   │   ├── base.ts
│   │   ├── decorators.ts
│   │   └── index.ts
│   └── package.json
├── devtools/         # 开发工具
│   ├── src/
│   │   └── index.ts
│   └── package.json
└── zeus/             # 主包
    ├── src/
    │   └── index.ts
    └── package.json
```

## 📦 包配置

### 主包 (zeus)

```json
{
  "name": "@zeus/framework",
  "version": "0.1.0",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./jsx-runtime": {
      "import": "./dist/jsx-runtime.mjs",
      "require": "./dist/jsx-runtime.js"
    }
  }
}
```

### 运行时包 (runtime)

```json
{
  "name": "@zeus/runtime",
  "version": "0.1.0",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts"
}
```

## 🧪 测试策略

### 单元测试

- Signals 响应式系统测试
- JSX 编译器测试
- 组件渲染测试
- Web Components 测试

### 集成测试

- 完整应用渲染测试
- 性能基准测试
- 浏览器兼容性测试

### 示例应用

```typescript
// examples/counter.tsx
import { createSignal, createEffect } from '@zeus/runtime'
import { jsx } from '@zeus/compiler'

function Counter() {
  const [count, setCount] = createSignal(0)

  createEffect(() => {
    console.log('Count changed:', count())
  })

  return jsx(
    'div',
    null,
    jsx('h1', null, 'Counter: ', count()),
    jsx(
      'button',
      {
        onClick: () => setCount(count() + 1),
      },
      'Increment',
    ),
  )
}

// 使用
const container = document.getElementById('app')
render(jsx(Counter, null), container)
```

## 🚀 发布计划

### Alpha 版本 (Week 10)

- 基础响应式系统
- 简单的 JSX 支持
- 基本组件渲染

### Beta 版本 (Week 12)

- 完整的 Web Components 支持
- 开发工具集成
- 性能优化

### 1.0 版本 (Week 14)

- 完整的文档
- 示例应用
- 生产环境优化

## 📊 性能目标

- **运行时大小**: < 10KB (gzipped)
- **首次渲染**: < 100ms
- **更新性能**: < 16ms (60fps)
- **内存使用**: 最小化内存泄漏

## 🔧 开发工具

- **TypeScript** 支持
- **ESLint** 和 **Prettier** 配置
- **Vitest** 测试框架
- **Rollup** 构建工具
- **开发服务器** 和 **热重载**

这个 MVP 路线图提供了一个清晰的开发路径，从核心的响应式系统开始，逐步构建完整的框架功能。每个阶段都有明确的目标和可交付成果，确保项目能够按计划推进。
