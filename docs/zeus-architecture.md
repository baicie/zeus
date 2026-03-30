# Zeus 项目架构与功能说明

> 本文档详细说明 Zeus 框架的架构设计和各模块功能实现，按照项目实际的文件组织结构进行描述。

## 目录

1. [项目概述](#1-项目概述)
2. [Rust 层 (crates)](#2-rust-层-crates)
3. [TypeScript 层 (packages)](#3-typescript-层-packages)
4. [Addons 层 (addons)](#4-addons-层-addons)
5. [模块依赖关系](#5-模块依赖关系)
6. [编译流程](#6-编译流程)

---

## 1. 项目概述

### 1.1 项目定位

Zeus 是一个现代化的前端框架，核心特点：

- **无虚拟 DOM**：直接 DOM 操作，类似 SolidJS 的编译器驱动渲染
- **Rust + OXC**：使用 Rust 语言和 oxc 框架实现高性能编译
- **细粒度响应式**：基于 alien-signal 的响应式系统
- **最小化运行时**：尽可能将计算转移到编译时

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 编译器 | Rust + OXC | 基于 oxc 的 JSX 编译器 |
| 响应式 | alien-signal | 细粒度响应式信号系统 |
| 运行时 | TypeScript | ES5 兼容的运行时 |
| 构建 | rolldown | 基于 Rust 的打包工具 |
| 测试 | Vitest | 单元测试和 E2E 测试 |
| 包管理 | pnpm | Monorepo 工作流 |

---

## 2. Rust 层 (crates)

Rust 层负责核心编译功能，基于 oxc 框架实现高性能 JSX 编译。

### 2.1 项目结构

```
crates/
├── compiler-core/          # 核心编译器，oxc 集成
├── compiler-common/        # 编译器公共模块
├── compiler-dom/           # DOM 编译器
├── compiler-ssr/           # SSR 编译器
├── compiler-web-component/ # WebComponent 编译器
└── zeusjs_binding/        # NAPI-RS 绑定层
```

### 2.2 compiler-common - 编译器公共模块

**路径**: `crates/compiler-common/src/`

提供编译器各模块共享的类型、配置和工具函数。

| 文件 | 核心功能 | 主要类型/函数 |
|------|---------|--------------|
| `lib.rs` | 模块入口 | 导出所有公共接口 |
| `config.rs` | 编译器配置 | `CompilerOptions`, `Target` 枚举 |
| `types.rs` | 共享类型定义 | `Binding`, `DomPath`, `TemplateIR` |
| `error.rs` | 错误类型定义 | `CompileError`, `Diagnostic` |
| `utils.rs` | 工具函数 | HTML 转义、字符串处理等 |

#### `config.rs` - 编译器配置

```rust
// 编译器选项
pub struct CompilerOptions {
    pub target: Target,              // 编译目标: Dom, Ssr, WebComponent
    pub jsx_pragma: Option<String>, // JSX pragma (默认 "h" 或 "jsx")
    pub runtime_module: Option<String>, // 运行时模块路径 (默认 "@zeus-js/core")
    pub delegate_events: bool,      // 是否启用事件委托
    pub delegated_events: Vec<String>, // 委托事件列表
    pub non_delegated_events: Vec<String>, // 不委托的事件
    pub built_ins: Vec<String>,     // 内置组件列表
    pub hydratable: bool,           // 是否生成 hydration 支持
    pub class_list: bool,           // 是否启用 classList 优化
    pub inline_styles: bool,        // 是否启用内联样式优化
    // ...
}

// 编译目标
pub enum Target {
    Dom,           // 浏览器 DOM
    Ssr,            // 服务端渲染
    WebComponent,   // WebComponent
}
```

#### `types.rs` - 共享类型

```rust
// 绑定信息
pub struct Binding {
    pub kind: BindingKind,  // 绑定类型
    pub dom_path: DomPath,  // DOM 路径
    pub source: String,      // 源代码
    pub needs_effect: bool,  // 是否需要 effect 包装
}

// DOM 路径
pub struct DomPath {
    pub steps: Vec<PathStep>,  // 路径步骤
}

// 路径步骤
pub enum PathStep {
    FirstChild,           // 获取第一个子元素
    NextSibling,          // 获取下一个兄弟元素
    ChildByIndex(usize),  // 按索引获取子元素
}
```

### 2.3 compiler-core - 核心编译器

**路径**: `crates/compiler-core/src/`

基于 oxc 的核心编译器，负责 JSX 解析、遍历和代码生成。

| 文件 | 核心功能 | 主要职责 |
|------|---------|---------|
| `lib.rs` | 模块入口 | 导出编译器 API |
| `parser.rs` | 解析器 | JSX/TSX 解析封装 |
| `traverse.rs` | AST 遍历 | JSX 转换核心逻辑 |
| `codegen.rs` | 代码生成 | 使用 oxc_codegen 生成代码 |

#### `traverse.rs` - 核心遍历逻辑

这是编译器最核心的文件，负责 JSX 到 DOM 操作的转换。

```rust
// 主要功能:
1. JSXElement 转换: JSX → template() 调用
2. JSXFragment 支持: <>...</> 片段支持
3. 条件表达式处理: ternary 和逻辑与 (&&)
4. 列表渲染检测: .map() 调用识别
5. if-return → ternary 转换
6. 委托事件收集: onClick 等事件
7. 模板清理: 移除占位注释、优化空白
```

#### `codegen.rs` - 代码生成

使用 `oxc_codegen` 将转换后的 AST 生成 JavaScript 代码。

### 2.4 compiler-dom - DOM 编译器

**路径**: `crates/compiler-dom/src/`

DOM 特定的编译转换，包括 JSX 处理和事件处理优化。

| 文件 | 核心功能 |
|------|---------|
| `lib.rs` | 模块入口，DOM 转换主逻辑 |
| `jsx.rs` | JSX 特定转换 |
| `control_flow.rs` | 控制流分析 |
| `template_analyzer.rs` | 模板分析 |
| `template_ir.rs` | 模板中间表示 |

### 2.5 compiler-ssr - SSR 编译器

**路径**: `crates/compiler-ssr/src/`

服务端渲染编译器，支持流式渲染和数据预取。

| 文件 | 核心功能 |
|------|---------|
| `lib.rs` | SSR 编译器入口 |
| `hydration.rs` | 客户端水合支持 |

### 2.6 compiler-web-component - WebComponent 编译器

**路径**: `crates/compiler-web-component/src/`

WebComponent 适配器，支持自定义元素。

| 文件 | 核心功能 |
|------|---------|
| `lib.rs` | WebComponent 编译器入口 |
| `options.rs` | 选项处理 |
| `macros.rs` | 宏定义处理 |

### 2.7 zeusjs_binding - NAPI-RS 绑定层

**路径**: `crates/zeusjs_binding/`

NAPI-RS 绑定层，暴露编译器功能给 JavaScript。

| 文件 | 核心功能 |
|------|---------|
| `lib.rs` | NAPI-RS 入口，导出编译函数 |
| `build.rs` | 构建配置 |

---

## 3. TypeScript 层 (packages)

TypeScript 层提供运行时支持，包括核心运行时、DOM 渲染器和工具函数。

### 3.1 项目结构

```
packages/
├── compiler-core/          # 编译器 JS 绑定
├── runtime-core/           # 核心运行时
├── runtime-dom/            # DOM 渲染器
├── signal/                 # 响应式信号
├── shared/                 # 共享工具
├── server-renderer/        # 服务端渲染
├── zeus/                   # 统一入口
└── compiler-browser/       # 浏览器编译器
```

### 3.2 @zeus-js/compiler-core - 编译器 JS 绑定

**路径**: `packages/compiler-core/src/`

提供 JavaScript 调用 Rust 编译器的桥梁。

| 文件 | 核心功能 | 主要 API |
|------|---------|---------|
| `index.ts` | 包入口 | `compiler`, `compileWebComponentMacros`, `transformWebComponentMacros` |
| `binding.cjs` | NAPI-RS 绑定 | 加载 Rust 编译器的 Node.js 绑定 |
| `browser.js` | 浏览器环境入口 | - |
| `wasi-worker.mjs` | WASI Worker | - |
| `binding.d.cts` | 类型声明 | - |

#### 主要类型

```typescript
interface WebComponentMacroOptions {
  enableMacros?: boolean
  autoDetect?: boolean
  macroModule?: string
  preserveMacros?: boolean
  macros?: string[]
  mode?: string
  extractDefinitions?: boolean
}

interface WebComponentMacroResult {
  code: string
  macrosFound: boolean
  macros?: MacroDefinitions
}
```

### 3.3 @zeus-js/runtime-core - 核心运行时

**路径**: `packages/runtime-core/src/`

核心运行时，提供组件系统、生命周期管理和调度器。

| 文件 | 核心功能 | 主要 API |
|------|---------|---------|
| `index.ts` | 包入口 | 导出所有核心模块 |
| `component.ts` | 组件类型定义 | `ComponentFunction<P>`, `App`, `Plugin` |
| `renderer.ts` | 组件渲染器 | `render()`, `createInstance()`, `mountComponent()` |
| `scheduler.ts` | 异步任务调度 | `nextTick()`, `queueJob()`, `queuePostFlushCb()` |
| `lifecycle.ts` | 生命周期钩子 | `onMount()`, `onCleanup()`, `onUnmount()` |
| `context.ts` | 上下文系统 | `createContext<T>()`, `provide<T>()`, `useContext<T>()` |
| `ref.ts` | Ref 类型 | `Ref<T>`, `isRef<T>()` |
| `slots.ts` | 插槽系统 | `Slot`, `renderSlot()` |
| `conditional.ts` | 条件渲染 | `conditional()`, `show()`, `switchCase()` |

#### `renderer.ts` - 组件渲染器

管理组件实例的生命周期：

```typescript
// 核心 API
export function render(code: string, element: Element): void
export function createInstance(component: ComponentFunction, props: Props): ComponentInstance
export function mountComponent(instance: ComponentInstance): Element
export function unmountInstance(instance: ComponentInstance): void
export function getCurrentInstance(): ComponentInstance | null
```

#### `scheduler.ts` - 任务调度器

实现类似 Vue 的任务调度：

```typescript
// 核心 API
export function nextTick(fn?: () => void): Promise<void>
export function queueJob(job: () => void): void
export function queuePostFlushCb(cb: () => void): void
export function resetScheduler(): void
```

#### `lifecycle.ts` - 生命周期钩子

```typescript
// 核心 API
export function onMount(fn: () => void | (() => void)): void
export function onCleanup(fn: () => void): void
export function onUnmount(fn: () => void): void
export function invokeMountHook(instance: ComponentInstance): void
export function invokeCleanupHook(instance: ComponentInstance): void
```

#### `context.ts` - 依赖注入

```typescript
// 核心 API
export interface Context<T> {
  id: symbol
  provider?: (props: { value: T; children?: any }) => any
}

export function createContext<T>(): Context<T>
export function provide<T>(value: T): void
export function useContext<T>(context: Context<T>): T
```

#### `conditional.ts` - 条件渲染

细粒度的响应式条件渲染，不依赖虚拟 DOM：

```typescript
// 核心 API
export function conditional<T>(
  predicate: () => T,
  truthyValue: T,
  falsyValue: T
): () => T

export function ifOnly(
  predicate: () => boolean,
  effect: () => void
): () => void

export function ifElse<T>(
  predicate: () => boolean,
  truthy: () => T,
  falsy: () => T
): () => T

export function show(
  predicate: () => boolean,
  content: () => any
): () => any

export function switchCase<T>(
  key: () => T,
  cases: Record<string | number, () => any>
): () => any

export function lazyConditional(
  predicate: () => boolean,
  truthyFactory: () => any,
  falsyFactory?: () => any
): () => any
```

### 3.4 @zeus-js/runtime-dom - DOM 渲染器

**路径**: `packages/runtime-dom/src/`

DOM 渲染器，负责虚拟 DOM 到真实 DOM 的转换，**是编译时生成代码的实际调用目标**。

| 文件 | 核心功能 | 主要 API |
|------|---------|---------|
| `index.ts` | 包入口 | 导出所有 DOM 功能 |
| `client.ts` | 核心 DOM 操作 | `template()`, `insert()`, `delegateEvents()` 等 |
| `dom.ts` | DOM 创建 | `createElement()`, `createText()`, `createFragment()` |
| `events.ts` | 事件处理 | `addEventListener()`, `EventHandler` |
| `directives.ts` | 指令系统 | `Directive`, `DirectiveBinding` |
| `h.ts` | JSX 类型声明 | `h()`, `jsx()`, `jsxs()` |
| `jsx.ts` | JSX 类型定义 | `Component`, `IntrinsicElements` |
| `create-app.ts` | 应用创建 | `createApp()` |
| `hmr.ts` | 热模块替换 | HMR 相关函数 |
| `components/*.ts` | 内置组件 | Fragment, Portal, ErrorBoundary 等 |

#### `client.ts` - 核心 DOM 操作 (最重要)

这些函数由编译器生成代码调用：

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// 模板系统
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建模板元素 - 编译器生成
 * @param html HTML 模板字符串
 * @param isSVG 是否为 SVG 元素
 * @returns 返回一个函数，调用后返回克隆的 DOM 节点
 */
export function template(html: string, isSVG?: boolean): () => Element {
    const tmpl = document.createElement('template');
    tmpl.innerHTML = html;
    if (isSVG) {
        // 设置 SVG 命名空间
        tmpl.content.querySelectorAll('svg, path, rect, circle, ellipse, line, polyline, polygon')
            .forEach(el => el.setAttribute('xmlns', 'http://www.w3.org/2000/svg'));
    }
    return () => tmpl.content.cloneNode(true) as Element;
}

/**
 * 动态内容插入 - 编译器生成
 */
export function insert(
    parent: Node,
    accessor: () => any,
    marker?: Node
): void {
    // 实现插入逻辑
}

// ═══════════════════════════════════════════════════════════════════════════
// 事件委托
// ═══════════════════════════════════════════════════════════════════════════

const delegatedEvents: Map<string, EventListener> = new Map();

/**
 * 注册委托事件 - 编译器生成
 */
export function delegateEvents(events: string[]): void {
    // 实现事件委托
}

// ═══════════════════════════════════════════════════════════════════════════
// 属性设置
// ═══════════════════════════════════════════════════════════════════════════

export function addEventListener(
    node: Element,
    eventName: string,
    handler: EventListener
): void { /* ... */ }

export function setAttribute(
    el: Element,
    name: string,
    value: any
): void { /* ... */ }

export function setProperty(
    el: Element,
    name: string,
    value: any
): void { /* ... */ }

export function className(el: Element, value: any): void { /* ... */ }

export function style(el: Element, value: any): void { /* ... */ }

// ═══════════════════════════════════════════════════════════════════════════
// 展开属性
// ═══════════════════════════════════════════════════════════════════════════

export function spread(
    target: Element | DocumentFragment,
    source: () => Record<string, any>,
    mergeAttrs?: boolean
): void { /* ... */ }

export function reconcileArray(
    parent: Node,
    newArr: any[],
    marker: Node | null
): void { /* ... */ }

// ═══════════════════════════════════════════════════════════════════════════
// ref 处理
// ═══════════════════════════════════════════════════════════════════════════

export function ref(node: Element, value: any): void { /* ... */ }
```

#### `jsx.ts` - JSX 类型定义

定义所有 HTML/SVG 元素的属性类型：

```typescript
// 核心类型
export interface Component<P = {}> {
    (props: P): any
    displayName?: string
}

export interface ParentComponent<P = {}> {
    (props: P & { children?: any }): any
}

// HTML 元素属性
export interface HTMLAttributes<T> {
    // 事件属性
    onCopy?: ClipboardEventHandler<T>
    onCut?: ClipboardEventHandler<T>
    onPaste?: ClipboardEventHandler<T>
    onFocus?: FocusEventHandler<T>
    onBlur?: FocusEventHandler<T>
    onChange?: FormEventHandler<T>
    onInput?: InputEventHandler<T>
    onInvalid?: FormEventHandler<T>
    onSubmit?: FormEventHandler<T>
    onLoad?: ReactEventHandler<T>
    onError?: ReactEventHandler<T>
    // ... 更多事件
    
    // 特殊属性
    ref?: Ref<any>
    key?: any
    children?: any
    
    // ARIA 属性
    role?: string
    tabIndex?: number
    // ... 更多 ARIA 属性
}

// 内置元素接口
export interface IntrinsicElements {
    div: HTMLAttributes<HTMLDivElement>
    span: HTMLAttributes<HTMLSpanElement>
    button: HTMLAttributes<HTMLButtonElement>
    input: InputHTMLAttributes<HTMLInputElement>
    // ... 所有 HTML 元素
}
```

#### `components/` - 内置组件

| 组件 | 文件 | 功能 |
|------|------|------|
| Fragment | `fragment.ts` | 无包装元素的片段 |
| Portal | `portal.ts` | 渲染到其他 DOM 节点 |
| ErrorBoundary | `error-boundary.ts` | 错误边界 |
| Suspense | `suspense.ts` | 异步加载 |
| Transition | `transition.ts` | CSS 过渡动画 |

### 3.5 @zeus-js/signal - 响应式信号系统

**路径**: `packages/signal/src/`

响应式信号系统，基于 `alien-signals` 库。

**包入口**: 直接 re-export `alien-signals` 包的所有内容

```typescript
// 实际源码在 node_modules 中
// 这里只是一个入口文件，重新导出 alien-signals
export * from 'alien-signals'
```

#### 核心 API (来自 alien-signals)

```typescript
// 创建信号
export function signal<T>(value: T): [() => T, (value: T) => void]

// 创建副作用
export function effect(fn: () => void): () => void

// 创建计算值
export function memo<T>(fn: () => T): () => T

// 批量更新
export function batch(fn: () => void): void

// 忽略追踪
export function untrack<T>(fn: () => T): T
```

### 3.6 @zeus-js/shared - 共享工具函数

**路径**: `packages/shared/src/`

项目各模块共享的工具函数集合。

| 文件 | 核心功能 |
|------|---------|
| `index.ts` | 包入口 |
| `general.ts` | 通用工具函数 |

#### `general.ts` - 工具函数详细列表

##### 类型检查函数

```typescript
export function isArray(value: any): value is Array<any>
export function isMap(value: any): value is Map<any, any>
export function isSet(value: any): value is Set<any>
export function isDate(value: any): value is Date
export function isRegExp(value: any): value is RegExp
export function isFunction(value: any): value is Function
export function isString(value: any): value is string
export function isSymbol(value: any): value is symbol
export function isObject(value: any): value is object
export function isPromise(value: any): value is Promise<any>
export function isPlainObject(value: any): boolean
export function isIntegerKey(key: string | symbol): boolean
```

##### 对象操作

```typescript
export function extend<T extends object, U extends object>(
    to: T,
    _from: U
): T & U

export function makeMap<K = any, V = any>(
    items: string[],
    pushCb?: (item: string) => void
): Map<K, V>

export function hasOwn<T = any>(
    obj: T,
    key: string
): boolean

export function hasChanged<T = any>(
    value: T,
    oldValue: T
): boolean
```

##### 字符串处理

```typescript
export function camelize(str: string): string
export function hyphenate(str: string): string
export function capitalize(str: string): string
export function toHandlerKey(str: string): string
```

##### 数组协调 (diff 算法)

```typescript
export interface KeyedMap<K, V> {
    get(key: K): V | undefined
    set(key: K, value: V): void
    has(key: K): boolean
    delete(key: K): void
    size: number
}

export function diffArrays<T>(
    newArr: T[],
    oldArr: T[],
    key: (item: T) => string | number
): {
    added: T[]
    removed: T[]
    moved: T[]
    unchanged: T[]
}
```

### 3.7 @zeus-js/server-renderer - 服务端渲染

**路径**: `packages/server-renderer/src/`

服务端渲染运行时，支持将组件渲染为 HTML 字符串。

| 文件 | 核心功能 |
|------|---------|
| `index.ts` | 包入口 |

#### 主要 API

```typescript
export function renderToString(component: () => any): string
export function renderToNodeStream(component: () => any): ReadableStream
export function renderToWebStream(component: () => any): ReadableStream
```

### 3.8 @zeus-js/zeus - 统一入口包

**路径**: `packages/zeus/src/`

整合所有功能模块的统一入口包。

| 文件 | 核心功能 |
|------|---------|
| `index.ts` | 统一入口 |

#### 导出内容

```typescript
// 重新导出 @zeus-js/runtime-dom 的所有内容
export * from '@zeus-js/runtime-dom'

// 框架信息
export const version = '__VERSION__'
export const framework = {
    name: 'Zeus',
    version: '__VERSION__',
    description: 'A modern reactive framework built with Rust and TypeScript'
}

// 创建应用实例
export interface App {
    mount(element: Element): void
    unmount(): void
}

export function createApp(rootComponent: ComponentFunction): App
```

---

## 4. Addons 层 (addons)

插件和扩展模块。

### 4.1 项目结构

```
addons/
├── bundle-plugin/          # Rolldown 插件
├── router/                 # 路由
├── store/                  # 状态管理
└── web-components/         # Web Components
```

### 4.2 router - 路由插件

**路径**: `addons/router/src/`

提供客户端路由功能。

| 文件 | 核心功能 |
|------|---------|
| `index.ts` | 包入口 |
| `RouterView.ts` | 路由视图组件 |
| `Link.ts` | 链接组件 |
| `hooks.ts` | 路由钩子 |

#### RouterView.ts - 路由视图组件

```typescript
// 核心功能
export function RouterView(props: RouterViewProps): any

// 核心属性
interface RouterViewProps {
    route?: RouteRecord
    depth?: number
}
```

### 4.3 store - 状态管理

**路径**: `addons/store/src/`

全局状态管理。

| 文件 | 核心功能 |
|------|---------|
| `index.ts` | 包入口 |
| `create-store.ts` | 创建 store |
| `hooks.ts` | store hooks |

---

## 5. 模块依赖关系

### 5.1 整体依赖图

```
@zeus-js/zeus (统一入口)
    │
    └── @zeus-js/runtime-dom
            │
            ├── @zeus-js/runtime-core
            │       │
            │       ├── lifecycle.ts ──────→ scheduler.ts
            │       ├── renderer.ts ───────→ lifecycle.ts, scheduler.ts
            │       ├── scheduler.ts (独立)
            │       ├── context.ts (独立)
            │       ├── slots.ts (独立)
            │       ├── ref.ts (独立)
            │       └── conditional.ts ────→ @zeus-js/signal
            │
            ├── @zeus-js/signal (alien-signals)
            ├── dom.ts (独立工具)
            ├── events.ts (独立工具)
            ├── directives.ts (类型定义)
            └── components/
                    ├── fragment.ts (独立)
                    ├── portal.ts ──────────→ @zeus-js/signal
                    ├── error-boundary.ts ──→ @zeus-js/signal
                    ├── suspense.ts ─────────→ @zeus-js/signal
                    └── transition.ts ───────→ @zeus-js/signal

@zeus-js/compiler-core (编译器绑定)
    │
    └── Rust (通过 NAPI-RS)

@zeus-js/server-renderer
    │
    └── @zeus-js/runtime-dom

@zeus-js/shared (独立工具库，被所有包引用)
```

### 5.2 编译时 vs 运行时

```
┌─────────────────────────────────────────────────────────────────┐
│                         编译时 (Rust)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  crates/compiler-core/src/traverse.rs                            │
│       │                                                         │
│       ├── JSXElement 转换                                        │
│       ├── 模板生成                                               │
│       ├── 事件委托收集                                            │
│       └── 代码生成 (oxc_codegen)                                 │
│                                                                  │
│  编译输出:                                                       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ const _tmpl$1 = template("<div><!----></div>");           │ │
│  │ const _el$ = _tmpl$1();                                   │ │
│  │ insert(_el$, count, _el$.firstChild);                      │ │
│  │ _el$.$$click = () => setCount(count() + 1);               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                         运行时 (TypeScript)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  packages/runtime-dom/src/client.ts                              │
│       │                                                         │
│       ├── template()  ← 编译产物调用                            │
│       ├── insert()     ← 编译产物调用                            │
│       ├── delegateEvents() ← 编译产物调用                        │
│       └── ...                                                    │
│                                                                  │
│  packages/runtime-core/src/                                      │
│       │                                                         │
│       ├── renderer.ts  ← 组件挂载                                │
│       ├── lifecycle.ts ← 生命周期管理                            │
│       ├── scheduler.ts ← 异步调度                               │
│       └── conditional.ts ← 条件渲染                              │
│                                                                  │
│  packages/signal/                                                │
│       │                                                         │
│       └── alien-signals ← 响应式系统                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 编译流程

### 6.1 完整编译流程

```
┌─────────────────────────────────────────────────────────────────┐
│                         编译流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 解析 (oxc_parser)                                            │
│     └─→ AST (Program)                                           │
│                                                                  │
│  2. 遍历 (oxc_traverse::traverse_mut)                           │
│     └─→ JSXElement/JSXFragment 转换                             │
│     └─→ 收集模板信息、委托事件、helper 依赖                       │
│                                                                  │
│  3. 代码生成 (oxc_codegen)                                       │
│     └─→ 生成 import、模板声明、委托事件注册                      │
│     └─→ 转换后的 JSX 代码                                        │
│                                                                  │
│  4. NAPI-RS 调用                                                │
│     └─→ Rust → JavaScript                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 编译示例

#### 输入代码

```tsx
import { signal } from "@zeus-js/signal";

function Counter() {
  const [count, setCount] = signal(0);
  
  return (
    <div className="container">
      <h1>Count: {count()}</h1>
      <button onClick={() => setCount(count() + 1)}>
        Increment
      </button>
    </div>
  );
}
```

#### 编译输出

```javascript
import { template, insert, effect, delegateEvents, signal } from "@zeus-js/core";

const _tmpl$1 = template("<div><h1>Count: <!----></h1><button>Increment</button></div>");

function Counter() {
  const [count, setCount] = signal(0);
  
  const _el$ = _tmpl$1();
  const _h1$ = _el$.firstChild;
  const _btn$ = _h1$.nextSibling;
  
  // 动态内容插入
  insert(_h1$, () => count());
  
  // 事件委托
  _btn$.$$click = () => setCount(count() + 1);
  
  return _el$;
}

// 注册委托事件
delegateEvents(["click"]);
```

---

## 附录

### A. 文件命名规范

| 语言 | 命名风格 | 示例 |
|------|---------|------|
| TypeScript | kebab-case | `create-app.ts`, `hmr.ts` |
| Rust | snake_case | `lib.rs`, `traverse.rs` |
| TypeScript 变量/函数 | camelCase | `createElement`, `onMount` |
| TypeScript 类型/接口 | PascalCase | `ComponentFunction`, `HTMLAttributes` |
| Rust 类型/函数 | PascalCase/snake_case | `CompilerOptions`, `compile_jsx` |

### B. API 导出规范

- `packages/*/src/index.ts` - 包入口，导出所有公共 API
- 使用 `export * from './xxx'` 统一导出子模块
- 类型定义使用 `export type` 分离
- 避免使用 `export default`

---

*本文档最后更新于 2026 年 3 月*
