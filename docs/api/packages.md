# Zeus Packages — Publish Reference & API Guide

> 本文档面向 AI agent 使用，列出 Zeus 所有可发布包的元信息、依赖关系与公共 API。语言：中文。

---

## 目录

1. [包总览](#1-包总览)
2. [包依赖关系图](#2-包依赖关系图)
3. [核心包详述](#3-核心包详述)
4. [工具链包](#4-工具链包)
5. [Web Component 输出包](#5-web-component-输出包)
6. [脚手架 / CLI 包](#6-脚手架--cli-包)
7. [安装方式](#7-安装方式)

---

## 1. 包总览

下表版本与各 package 的 `package.json` 保持同步，位于 monorepo `packages/` 下，通过 pnpm workspace 管理。

| 包名                            | 路径                                  | 版本         | 类型     | 说明                                         |
| ------------------------------- | ------------------------------------- | ------------ | -------- | -------------------------------------------- |
| `@zeus-js/zeus`                 | `packages/core/zeus`                  | 0.1.0        | core     | 统一入口，导出所有公共 API                   |
| `@zeus-js/signal`               | `packages/core/signal`                | 0.1.0        | core     | 响应式核心，基于 alien-signals               |
| `@zeus-js/runtime-dom`          | `packages/core/runtime-dom`           | 0.1.0        | core     | DOM runtime helpers                          |
| `@zeus-js/runtime-ssr`          | `packages/core/runtime-ssr`           | 0.1.0        | core     | 服务端字符串渲染 runtime                     |
| `@zeus-js/compiler`             | `packages/core/compiler`              | 0.1.1-beta.0 | core     | Rust-native JSX/TSX 编译器                   |
| `@zeus-js/compiler-native`      | `packages/core/compiler-native`       | 0.1.1-beta.0 | core     | Node native loader                           |
| `@zeus-js/shared`               | `packages/core/shared`                | 0.1.0        | core     | 内部工具函数，无外部依赖                     |
| `@zeus-js/vite-plugin`          | `packages/devtools/vite-plugin`       | 0.0.4        | devtools | Vite 集成插件                                |
| `create-zeus`                   | `packages/devtools/create-zeus`       | 0.1.2        | devtools | 项目脚手架生成器（CLI）                      |
| `@zeus-js/output-wc`            | `packages/web-c/output-wc`            | 0.1.0        | web-c    | Web Component 输出插件                       |
| `@zeus-js/output-react-wrapper` | `packages/web-c/output-react-wrapper` | 0.1.0        | web-c    | React wrapper 输出插件                       |
| `@zeus-js/output-vue-wrapper`   | `packages/web-c/output-vue-wrapper`   | 0.1.0        | web-c    | Vue wrapper 输出插件                         |
| `@zeus-js/output-icons`         | `packages/web-c/output-icons`         | 0.1.0        | web-c    | 图标输出插件                                 |
| `@zeus-js/output-css`           | `packages/web-c/output-css`           | 0.1.0        | web-c    | CSS 资源输出插件                             |
| `@zeus-js/component-analyzer`   | `packages/web-c/component-analyzer`   | 0.1.0        | web-c    | 组件分析器（解析 JSX）                       |
| `@zeus-js/component-dts`        | `packages/web-c/component-dts`        | 0.1.0        | web-c    | manifest DTS 生成器                          |
| `@zeus-js/bundler-plugin`       | `packages/web-c/bundler-plugin`       | 0.1.0        | web-c    | bundler 插件宿主（Vite / Rollup / Rolldown） |
| `@zeus-js/web-c`                | `packages/web-c/web-c`                | 0.1.0        | web-c    | Web-C 聚合入口与组件库预设                   |
| `@zeus-ui/registry`             | `packages/create/registry`            | 0.0.1        | create   | UI 组件注册表（copyable 源码）               |
| `zeus-ui`                       | `packages/create/zeus-ui`             | 0.0.1        | create   | CLI 工具添加 UI 组件到项目                   |

**不推荐直接引入的内部包**（无 `main`/`exports`，仅供 workspace 内部使用）：

- `packages/core/runtime-dom/src/` 下的各子模块（template、bindings、events、context 等）

---

## 2. 包依赖关系图

```
@zeus-js/zeus (统一入口)
├── @zeus-js/signal
│   ├── @zeus-js/shared
│   └── alien-signals (external)
├── @zeus-js/runtime-dom
│   └── @zeus-js/signal
└── @zeus-js/runtime-ssr
    └── @zeus-js/signal

@zeus-js/compiler
└── @zeus-js/compiler-native

@zeus-js/vite-plugin
└── @zeus-js/compiler-native

@zeus-js/web-c
├── @zeus-js/output-css
├── @zeus-js/output-react-wrapper
├── @zeus-js/output-vue-wrapper
└── @zeus-js/output-wc

@zeus-js/output-wc
├── @zeus-js/bundler-plugin
├── @zeus-js/component-analyzer
└── @zeus-js/component-dts

@zeus-js/bundler-plugin
├── @zeus-js/compiler-native
├── @zeus-js/component-analyzer
├── fast-glob
├── picomatch
├── rollup (optional peer)
├── rolldown (optional peer)
└── vite (optional peer)

@zeus-js/component-dts
└── @zeus-js/component-analyzer
```

---

## 3. 核心包详述

### 3.1 `@zeus-js/zeus`

**用途**：Zeus 的统一入口包，推荐用户直接 import 的包。

**导出文件**：

```
@zeus-js/zeus
├── main export    → 响应式 API + DOM Runtime + Context + JSX
├── ./jsx          → JSX 类型引用 (jsx.d.ts)
├── ./jsx-runtime  → jsx / jsxs / jsxDEV / Fragment
├── ./jsx-dev-runtime → 开发环境 JSX runtime
└── ./server       → renderToString + SSR 控制流 + 响应式 API
```

#### 响应式 API（来自 `@zeus-js/signal`）

| API            | 签名                                       | 说明                   |
| -------------- | ------------------------------------------ | ---------------------- |
| `createSignal` | `(initial: T) => [Accessor<T>, Setter<T>]` | 创建浅层 getter/setter |
| `createMemo`   | `(fn: () => T) => Accessor<T>`             | 创建缓存派生 getter    |
| `createEffect` | `(fn: () => void) => void`                 | 创建有 owner 的副作用  |
| `createRoot`   | `(fn: (dispose: () => void) => T) => T`    | 创建显式 owner         |
| `batch`        | `(fn: () => T) => T`                       | 批量更新               |
| `onCleanup`    | `(fn: () => void) => void`                 | 注册 effect/owner 清理 |

#### DOM Runtime API

| API             | 签名                                                         | 说明                                      |
| --------------- | ------------------------------------------------------------ | ----------------------------------------- |
| `render`        | `(vnode: JSXValue, target: Element, options?) => () => void` | 将 JSX 渲染到 DOM 节点，返回 dispose 函数 |
| `Show`          | `(props: ShowProps) => JSXValue`                             | 条件渲染组件                              |
| `For`           | `<T>(props: ForProps<T>) => JSXValue`                        | 列表渲染组件                              |
| `Host`          | `(props: HostProps) => JSXValue`                             | Web Component 宿主边界（编译期内置）      |
| `Slot`          | `(props: SlotProps) => JSXValue`                             | Web Component slot（编译期内置）          |
| `defineElement` | `(tagName, options, setup) => CustomElementConstructor`      | 定义 custom element                       |

#### Context API

| API             | 签名                                      | 说明                |
| --------------- | ----------------------------------------- | ------------------- |
| `createContext` | `<T>(defaultValue?: T) => Context<T>`     | 创建 context        |
| `provide`       | `(context: Context<T>, value: T) => void` | 提供值              |
| `inject`        | `<T>(context: Context<T>) => T`           | 注入值              |
| `useContext`    | `<T>(context: Context<T>) => T`           | 同 `inject`（别名） |

#### JSX Runtime

| API        | 说明                         |
| ---------- | ---------------------------- |
| `jsx`      | 编译时调用，创建 JSX 元素    |
| `jsxs`     | 编译时调用，创建多个子元素   |
| `jsxDEV`   | 开发环境 JSX 运行时          |
| `Fragment` | JSX Fragment，等价于 `<></>` |

#### 类型导出

```ts
type Accessor<T>
type Setter<T>
type JSXValue
type Component<P>
type ShowProps
type ForProps<T, K>
type HostProps
type SlotProps
type DefineElementOptions<P>
type DefineElementMeta
type DefineElementContext
type DefineElementSetup<P, E>
type Context<T>
type ContextProviderProps<T>
type ContextBridgeProps<T>
```

#### 使用示例

```tsx
import {
  render,
  Show,
  For,
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
} from '@zeus-js/zeus'

// 基础渲染
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)

createEffect(() => {
  console.log('count changed:', count())
  onCleanup(() => console.log('cleanup'))
})

render(
  <div>
    <p>count: {count()}</p>
    <p>doubled: {doubled()}</p>
    <button onClick={() => setCount(c => c + 1)}>+</button>
  </div>,
  document.getElementById('app')!,
)

// 条件渲染
render(
  <Show when={count() > 5} fallback={<p>small</p>}>
    <p>big!</p>
  </Show>,
  document.getElementById('app')!,
)

// 列表渲染
const [items] = createSignal(['apple', 'banana', 'cherry'])
render(
  <For each={items()}>{item => <li>{item}</li>}</For>,
  document.getElementById('app')!,
)
```

---

### 3.2 `@zeus-js/signal`

**用途**：响应式核心，纯 TypeScript，无 DOM 依赖。主入口只导出 RFC-001 的六个显式原语。

底层 engine 位于 `@zeus-js/signal/internal`，仅供 Zeus 自身 packages 使用，不属于应用接口。

#### 公共导出

```ts
export {
  createSignal,
  createMemo,
  createEffect,
  createRoot,
  onCleanup,
  batch,
  type Accessor,
  type Setter,
}
```

`@zeus-js/signal/internal` does not define an application contract. Its exports
may change whenever Zeus changes its runtime implementation, and application or
downstream package code must not import it.

---

### 3.3 `@zeus-js/runtime-dom`

**用途**：DOM runtime helpers，供编译器生成的代码调用，也可直接使用。

#### 完整导出列表

```ts
// types
export type {
  JSXValue,
  JSXGetter,
  Component,
  TemplateFactory,
  AttrValue,
  ClassValue,
  StyleValue,
  RefTarget,
}

// template
export { template }

// render
export { render, type RenderOptions }

// insert
export { insert, mountDynamic, insertTracked }

// dom utils
export { marker, child, removeNodes }

// bindings
export {
  bindText,
  bindTextContent,
  bindAttr,
  bindProp,
  bindClass,
  bindStyle,
  setAttr,
  normalizeClass,
}

// events
export { bindEvent, delegateEvents }

// refs
export { setRef, bindRef }

// component
export { createComponent }

// control flow
export {
  Show,
  For,
  mountShow,
  mountFor,
  resolveValue,
  type ShowProps,
  type ForProps,
}

// web components
export {
  defineElement,
  type DefineElementOptions,
  type DefineElementMeta,
  type DefineElementContext,
  type DefineElementSetup,
  type ElementPropConstructor,
  type PropDefinition,
  type PropReactivity,
  type PropOptions,
}
export { Host, Slot, type HostProps, type SlotProps }
export { createSlot }

// host context
export {
  getCurrentHostContext,
  withHostContext,
  captureCurrentHostContext,
  withCapturedHostContext,
  type HostRenderContext,
  type HostRenderMode,
}

// context
export { createContext, useContext, provide, inject }

// advanced context (内部)
export {
  getCurrentOwner,
  createOwner,
  runWithOwner,
  createDOMContextBoundary,
  provideDOMContext,
  resolveDOMContext,
  ZEUS_CONTEXT_REQUEST,
  type Context,
  type ContextId,
  type ContextProviderProps,
  type ContextBridgeProps,
  type Owner,
  type ZeusContextRequestDetail,
  type ZeusContextRequestEvent,
  type DOMContextResolution,
}
```

#### defineElement 详解

```tsx
import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

const Counter = defineElement(
  'z-counter',
  {
    shadow: true, // 或 { mode: 'open', delegatesFocus: true }
    props: {
      count: Number,
      title: String,
      open: Boolean,
      rows: {
        type: Array,
        reactivity: 'shallow', // 仅跟踪顶层引用替换，保留原始数组/row identity
      },
      data: {
        type: Object,
        attr: 'data-config', // 指定 attribute 名称
        reflect: true, // prop → attribute 反射
        default: () => ({ value: 0 }),
      },
    },
    styles: `
      :host { display: block; padding: 1rem; }
      :host([open]) { border: 1px solid #ccc; }
    `,
    consumes: [], // 消费的 context
    meta: {
      description: 'A simple counter component',
      props: { count: { description: 'Current count value' } },
      events: {
        change: {
          description: 'Fired when count changes',
          detail: { value: 'number' },
        },
      },
    },
  },
  (props, context) => {
    // props: Readonly<P>，响应式
    // context.emit 根据 options.emits 提供类型化方法
    return (
      <Host>
        <h2>{props.title ?? 'Default Title'}</h2>
        <p>Count: {props.count}</p>
        <button onClick={() => context.emit.change(props.count + 1)}>+</button>
        <Slot name="extra" />
      </Host>
    )
  },
)

// 使用
// <z-counter count="5" title="My Counter"></z-counter>
```

prop 默认使用 deep reactivity。`reactivity: 'shallow'` 适用于 rows、columns
等大型 immutable 集合：替换整个 prop reference 会触发更新；原地修改数组元素
或嵌套对象不会触发更新。shallow prop 必须采用 replace-on-write。

#### Host / Slot 详解

```tsx
// Host — Web Component 根边界，只能在 defineElement 内使用
// mode: 'shadow' | 'light'
// lightChildren: 子节点投影
const node = <Host mode="light" />

// Slot — 投影槽
// Shadow DOM: 编译为原生 <slot>
// Light DOM: Zeus 自己实现投影逻辑（MutationObserver）
<Slot name="header" />        // 具名 slot
<Slot />                       // 默认 slot
```

#### Context 详解

```ts
// 定义 context
const ThemeContext = createContext({ color: 'blue', setColor: () => {} })

// provide — 在父组件中提供
provide(ThemeContext, { color: 'red', setColor: (c) => {} })

// inject — 在子组件中消费
const theme = inject(ThemeContext)

// 配合 Web Component 使用
defineElement('my-element', {
  consumes: [ThemeContext], // 自动从 DOM 树解析
}, (props, ctx) => ...)
```

---

### 3.4 `@zeus-js/compiler`

**用途**：Rust-native transform API，将 TSX/JSX 编译为 Zeus runtime 调用。

#### 导出

```ts
import { transformModule } from '@zeus-js/compiler'

const result = transformModule({
  source: code,
  filename: 'view.tsx',
  target: 'dom',
  runtimeModule: '@zeus-js/runtime-dom',
  delegateEvents: true,
  sourceMap: true,
})
```

#### TransformModuleOptions 说明

| 选项             | 说明                               |
| ---------------- | ---------------------------------- |
| `source`         | 输入 TSX/JSX 模块源码。            |
| `filename`       | 诊断与 source map 使用的源文件名。 |
| `target`         | `'dom'` 或 `'ssr'`。               |
| `runtimeModule`  | 生成代码导入的 runtime 模块。      |
| `delegateEvents` | 是否启用 DOM 事件委托。            |
| `sourceMap`      | 是否生成 Source Map v3。           |
| `hmr`            | 是否注入开发期顶层 render 边界。   |

结果包含生成代码、可选 Source Map v3 和结构化 diagnostics。编译错误不会被折叠成异常字符串。

### 3.5 `@zeus-js/shared`

**用途**：内部工具库，无外部依赖，供所有 `@zeus-js/*` 包共享。

#### 导出

```ts
export { makeMap } from './makeMap'
export * from './general' // 通用工具函数
export * from './typeUtils' // 类型工具
```

---

## 4. 工具链包

### 4.1 `@zeus-js/vite-plugin`

**用途**：Vite 集成插件，在 `transform` 阶段调用 Rust-native `transformModule` 处理 TSX。

#### 导出

```ts
import { createZeus, zeus } from '@zeus-js/vite-plugin'
// createZeus === zeus

export interface ZeusVitePluginOptions {
  include?: RegExp | RegExp[] // 包含的文件，默认 /\.[tj]sx$/
  exclude?: RegExp | RegExp[] // 排除的文件，默认 node_modules
  hmr?: boolean // dev server 顶层 render root 自动 dispose/remount，默认 true
  ssrModuleName?: string // SSR runtime 模块，默认 @zeus-js/runtime-ssr
  compiler?: { moduleName?: string; delegateEvents?: boolean } // native transform 选项
}
```

自动 HMR 边界只注入浏览器 dev transform。它会在模块替换前释放旧
`render()` root，并在新模块执行时重新挂载；本地 signal 状态不会保留。
生产构建、SSR transform，以及已经自行使用 `import.meta.hot` 的模块不会被
自动注入。

#### vite.config.ts 使用

```ts
// 方式 1：推荐
import { defineConfig } from 'vite'
import { createZeus } from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [
    createZeus({
      compiler: {
        moduleName: '@zeus-js/runtime-dom',
        delegateEvents: true,
        // ... 其他编译器选项
      },
    }),
  ],
})

// 方式 2：别名
import { zeus } from '@zeus-js/vite-plugin'
export default defineConfig({ plugins: [zeus()] })
```

> 注意：`@zeus-js/vite-plugin` 需要 `vite` 作为 peer dependency。插件会自动解析 `@zeus-js/runtime-dom` 与 `@zeus-js/runtime-ssr` 的入口路径，并根据 Vite transform 上下文选择编译目标。

---

## 5. Web Component 输出包

这是 Zeus 的组件库编译器基础设施，用于将 Zeus 组件库源码编译为多种输出格式。

### 5.1 架构概览

```
@zeus-js/web-c (聚合与预设入口)
    │
    ├── @zeus-js/output-css          → CSS 资源输出（PostCSS / Sass / Less / LightningCSS）
    ├── @zeus-js/output-icons        → 无运行时图标处理
    ├── @zeus-js/output-react-wrapper → 生成 React wrapper（useXxx hooks）
    ├── @zeus-js/output-vue-wrapper  → 生成 Vue wrapper（setup composables）
    └── @zeus-js/output-wc          → Web Component 输出
                                          ├── @zeus-js/bundler-plugin (宿主)
                                          │       ├── ./vite   → Vite 插件
                                          │       ├── ./rollup → Rollup 插件与 defineZeusRollupConfig
                                          │       ├── ./rolldown → Rolldown 插件与 defineZeusRolldownConfig
                                          │       └── ./manifest → manifest 生成
                                          ├── @zeus-js/component-analyzer (JSX 解析)
                                          └── @zeus-js/component-dts (类型生成)
```

### 5.2 `@zeus-js/bundler-plugin`

**用途**：bundler 插件宿主，支持 Vite、Rollup 和 Rolldown。

#### 导出

```ts
// 主入口：Rollup 默认入口
export { default, zeus } from './rollup'

// Vite 插件
export { default, zeus } from './vite'

// Rollup 插件与配置 helper
export { default, zeus, defineZeusRollupConfig } from './rollup'

// Rolldown 插件与配置 helper
export { default, zeus, defineZeusRolldownConfig } from './rolldown'

// Manifest 插件
export { manifest } from './manifest'
```

#### 默认 TS / TSX 行为

| 入口         | 默认 `transpile` | 行为                                                           |
| ------------ | ---------------- | -------------------------------------------------------------- |
| `./rollup`   | `true`           | Zeus 编译 JSX，并用 TypeScript API 擦除 TS 类型。              |
| `./rolldown` | `false`          | Zeus 编译 JSX，默认交给 Rolldown internal transform 处理 TS。  |
| `./vite`     | `false`          | Zeus 编译 JSX，默认交给 Vite 的 esbuild/Oxc pipeline 处理 TS。 |

显式传入 `zeus({ transpile: true })` 时，三个 adapter 都会对 TS-like 文件运行 TypeScript API downlevel。Rollup adapter 还会默认补充 extensionless 解析：

```ts
;['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
```

`defineZeusRollupConfig()` 和 `defineZeusRolldownConfig()` 会将 component plugin 声明的 `external` 与用户配置合并；Vite adapter 也会在 `config()` hook 中合并这些 external。

`components` 仅控制组件分析、manifest、DTS 和 watch files；`transform` 控制 Zeus JSX 编译范围。默认情况下，`src/shared/**` 不进入 component manifest，但仍会执行 Zeus JSX 编译，避免共享 TSX helper 被排除后留下未编译 JSX。

如果用户自定义 `components.include` 且没有显式配置 `transform.include`，自定义 component include 会自动并入默认 transform include，保证被组件分析的文件默认也会被 Zeus compiler 编译。Rollup extensionless resolver 不消费带 query/hash 的 import，避免影响其他插件的 query 语义。

### 5.3 `@zeus-js/component-analyzer`

**用途**：解析 Zeus 组件源码，提取组件元信息（props、events、slots、CSS vars/parts）。

**peerDependencies**：`@babel/parser`、`@babel/types`、`fast-glob`

### 5.4 `@zeus-js/component-dts`

**用途**：根据 `component-analyzer` 提取的 manifest 生成 `.d.ts` 类型文件。

### 5.5 `@zeus-js/output-css`

**用途**：将组件的 CSS 提取并处理为独立资源文件。

**peerDependencies**（全部 optional）：

- `lightningcss`
- `postcss` + `postcss-load-config`
- `sass`
- `less`
- `rollup`

### 5.6 `@zeus-js/output-icons`

**用途**：处理 SVG 图标为无运行时引用的静态资源。

**peerDependencies**（optional）：`react`、`vue`

### 5.7 `@zeus-js/output-react-wrapper`

**用途**：为每个 Zeus 组件生成 React wrapper（以 hook 形式：`useZCounter`）。

**peerDependencies**（optional）：`react >=18 || >=19`

### 5.8 `@zeus-js/output-vue-wrapper`

**用途**：为每个 Zeus 组件生成 Vue 3 wrapper（以 composable 形式：`useZCounter`）。

**peerDependencies**（optional）：`vue >=3`

### 5.9 `@zeus-js/output-wc`

**用途**：为每个 Zeus 组件生成原生 Web Component 输出。

**peerDependencies**（optional）：`rollup`

### 5.10 `@zeus-js/web-c`

**用途**：统一导出 Web-C 工具链，并通过 `componentLibrary()` 一键集成上述输出插件。

**主要依赖**：

- `@zeus-js/output-css`
- `@zeus-js/output-react-wrapper`
- `@zeus-js/output-vue-wrapper`
- `@zeus-js/output-wc`

---

## 6. 脚手架 / CLI 包

### 6.1 `create-zeus`

**用途**：交互式项目脚手架生成器。

```bash
pnpm create zeus
# 或
npx create-zeus
```

**内部依赖**：`@clack/prompts`、`picocolors`

### 6.2 `zeus-ui`

**用途**：CLI 工具，从 `@zeus-ui/registry` 拉取组件模板到用户项目。

```bash
npx zeus-ui add button
npx zeus-ui add dialog --theme dark
```

**依赖**：`@zeus-ui/registry`、`commander`、`prompts`、`kleur`

### 6.3 `@zeus-ui/registry`

**用途**：UI 组件注册表，提供 copyable 源码模板。

#### 导出

```ts
// 主入口
export from './main'

// 工具函数
export from './shared/cn'    // className 合并工具 (clsx/cn 风格)
export from './shared/theme' // 主题配置工具
```

---

## 7. 安装方式

```bash
# 核心包
pnpm add @zeus-js/zeus
# 或单独安装
pnpm add @zeus-js/signal @zeus-js/runtime-dom
pnpm add @zeus-js/compiler  # 自动安装匹配平台 native package
pnpm add @zeus-js/vite-plugin  # peer: vite

# Web Component 组件库输出
pnpm add @zeus-js/web-c
# 或单独添加需要的输出插件
pnpm add @zeus-js/output-wc @zeus-js/output-react-wrapper @zeus-js/output-vue-wrapper @zeus-js/output-css

# CLI
pnpm add -D @zeus-js/vite-plugin create-zeus
pnpm add @zeus-ui/registry
pnpm add @zeus-ui/cli
```

---

## 附录 A：package.json exports 速查

每个 CJS 导出都在 `require` 条件内声明 `production`、`development` 和
`default`。Node 或打包器显式启用对应 condition 时会直接解析到下列产物；
未提供自定义 condition 时，包根级 `require` 先解析到 `index.cjs`，再根据
`NODE_ENV` 选择开发或生产产物。附加入口默认直接使用开发产物；
`@zeus-js/signal/internal` 例外，它通过 `internal.cjs` 按 `NODE_ENV` 选择与包根一致的
signal engine，避免公共 API 与 runtime helper 各自持有响应式状态。

| 包                     | ESM 入口                          | CJS 开发 / 生产产物                                  | 全局 CDN                     |
| ---------------------- | --------------------------------- | ---------------------------------------------------- | ---------------------------- |
| `@zeus-js/zeus`        | `dist/zeus.esm-bundler.js`        | `dist/zeus.cjs` / `dist/zeus.prod.cjs`               | `dist/zeus.global.js`        |
| `@zeus-js/signal`      | `dist/signal.esm-bundler.js`      | `dist/signal.cjs` / `dist/signal.prod.cjs`           | `dist/signal.global.js`      |
| `@zeus-js/runtime-dom` | `dist/runtime-dom.esm-bundler.js` | `dist/runtime-dom.cjs` / `dist/runtime-dom.prod.cjs` | `dist/runtime-dom.global.js` |
| `@zeus-js/compiler`    | `dist/compiler.esm-bundler.js`    | `dist/compiler.cjs` / `dist/compiler.prod.cjs`       | `dist/compiler.global.js`    |
| `@zeus-js/shared`      | `dist/shared.esm-bundler.js`      | `dist/shared.cjs` / `dist/shared.prod.cjs`           | —                            |
| `@zeus-js/vite-plugin` | `dist/vite-plugin.esm-bundler.js` | `dist/vite-plugin.cjs` / `dist/vite-plugin.prod.cjs` | —                            |

## 附录 B：pnpm catalog 共享依赖版本

```yaml
'@babel/parser': ^8.0.0
'@babel/types': ^8.0.0
'@napi-rs/cli': 3.6.2
'@napi-rs/wasm-runtime': ^1.1.1
vite: ^8.0.5
```
