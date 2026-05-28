建议结论：

```txt
主 API 采用 React 风格：
  createContext()
  useContext()
  <Context.Provider value={...}>

底层补充 Vue 风格：
  provide()
  inject()

Web Component 兼容：
  Provider 支持 bridge 模式
  defineElement 支持 consumes
  通过 DOM Event 协议跨 Web Component 边界传递 Context
```

也就是说，**不要只做 Vue 那种纯注入式**。Zeus 是 TSX / JSX 框架，主心智更适合 React 风格；但底层实现应该保留 `provide/inject`，这样 Web Component、插件、内部 runtime 都更好接。

---

# 1. 推荐使用方式

## 1.1 普通 Zeus 组件：React 风格

```tsx
import { createContext, render, state, useContext } from '@zeus-js/zeus'

type ThemeState = {
  mode: 'light' | 'dark'
  toggle: () => void
}

const ThemeContext = createContext<ThemeState>()

function App() {
  const theme = state({
    mode: 'light' as 'light' | 'dark',
    toggle() {
      theme.mode = theme.mode === 'light' ? 'dark' : 'light'
    },
  })

  return (
    <ThemeContext.Provider value={theme}>
      <Panel />
    </ThemeContext.Provider>
  )
}

function Panel() {
  const theme = useContext(ThemeContext)

  return (
    <section class={{ dark: theme.mode === 'dark' }}>
      <button onClick={theme.toggle}>mode: {theme.mode}</button>
    </section>
  )
}

render(() => <App />, document.getElementById('root')!)
```

这个用法最适合作为文档主推。

---

## 1.2 低层能力：Vue 风格 `provide/inject`

适合插件、setup 函数、Web Component 内部：

```tsx
import { createContext, inject, provide, state } from '@zeus-js/zeus'

const ThemeContext = createContext<{
  mode: 'light' | 'dark'
}>()

function Root() {
  const theme = state({
    mode: 'dark' as const,
  })

  provide(ThemeContext, theme)

  return <Child />
}

function Child() {
  const theme = inject(ThemeContext)

  return <div>{theme.mode}</div>
}
```

注意：这个不作为主推心智，但要提供。

---

## 1.3 Web Component 兼容用法

普通 Zeus 组件树的 Context 是 JS owner tree；Web Component 内部是单独 render root，所以需要 bridge。

```tsx
import {
  createContext,
  defineElement,
  Host,
  Slot,
  state,
  useContext,
} from '@zeus-js/zeus'

type ThemeState = {
  mode: 'light' | 'dark'
}

export const ThemeContext = createContext<ThemeState>()

defineElement(
  'z-card',
  {
    shadow: false,
    consumes: [ThemeContext],
  },
  () => {
    const theme = useContext(ThemeContext)

    return (
      <Host>
        <article class={{ dark: theme.mode === 'dark' }}>
          <Slot />
        </article>
      </Host>
    )
  },
)

function App() {
  const theme = state({
    mode: 'dark' as const,
  })

  return (
    <ThemeContext.Provider value={theme} bridge>
      <z-card>
        <p>Hello Web Component</p>
      </z-card>
    </ThemeContext.Provider>
  )
}
```

核心是：

```tsx
<ThemeContext.Provider value={theme} bridge>
  <z-card />
</ThemeContext.Provider>
```

`bridge` 会在 DOM 中创建一个透明 Context boundary，Web Component 通过 DOM event 向上请求 Context。

---

# 2. 为什么主 API 更推荐 React 风格？

React 风格：

```tsx
<ThemeContext.Provider value={theme}>
  <App />
</ThemeContext.Provider>
```

优点：

```txt
1. TSX 用户心智自然
2. Context 来源显式，组件树结构清楚
3. 类型推导好做
4. 和 Provider / Bridge / Web Component 兼容更顺
5. 文档更容易写
```

Vue 风格：

```ts
provide(ThemeContext, theme)
inject(ThemeContext)
```

优点是底层灵活，但问题是：

```txt
1. 依赖关系更隐式
2. TSX 里不如 Provider 边界直观
3. 跨 Web Component 时仍然需要额外桥接
```

所以最终建议是：

```txt
文档主推：
  createContext + useContext + Provider

底层保留：
  provide + inject
```

---

# 3. 架构设计

你现在 `@zeus-js/zeus` 主入口已经是用户 API 层，导出 `render / Show / For / Host / Slot / defineElement` 等。

Context 应该属于用户主 API，所以最终要从 `@zeus-js/zeus` 导出。

内部需要新增一个 **Owner Context Tree**：

```txt
Owner
  parent?: Owner
  provides: Map<symbol, unknown>
```

组件调用时创建 owner：

```txt
createComponent(Component, props)
  ↓
创建子 owner
  ↓
runWithOwner(owner, () => Component(props))
```

Provider 做的事：

```txt
创建子 owner
把 context value 存入 owner.provides
在这个 owner 下渲染 children
```

`useContext()` 做的事：

```txt
从 currentOwner 往 parent 链向上找 context
找不到则返回 defaultValue
再找不到则报错
```

---

# 4. 新增 runtime context 模块

建议放在 runtime-dom，因为 `createComponent / render / defineElement` 都在 runtime-dom。

新增：

```txt
packages/runtime-dom/src/context.ts
```

## `context.ts` 代码草案

```ts
import { onScopeDispose } from '@zeus-js/signal'

import { insert } from './insert'

import type { JSXValue } from './types'

export type ContextId = symbol

// NOTE: ContextId 基于 Symbol()，因此只能在同一 JavaScript realm（同一 window/iframe/worker）内工作。
// 跨 iframe 边界时，每个 iframe 有独立的 Symbol factory，相同的 description 会产生不同的 Symbol，
// 导致 Context 匹配失效。如需跨 realm 支持，需要改用字符串 ID + 全局注册表。

export interface Context<T> {
  id: ContextId
  defaultValue?: T
  Provider: ContextProvider<T>
  Bridge: ContextBridge<T>
}

export interface ContextProviderProps<T> {
  value: T
  children?: JSXValue | (() => JSXValue)

  /**
   * When true, Provider also creates a DOM context boundary.
   * This is required for native custom elements / Web Components.
   */
  bridge?: boolean
}

export interface ContextBridgeProps<T> {
  value: T
  children?: JSXValue | (() => JSXValue)
}

export type ContextProvider<T> = (props: ContextProviderProps<T>) => JSXValue

export type ContextBridge<T> = (props: ContextBridgeProps<T>) => JSXValue

export interface Owner {
  parent?: Owner
  provides: Map<ContextId, unknown>
}

let currentOwner: Owner | undefined

export function getCurrentOwner(): Owner | undefined {
  return currentOwner
}

export function createOwner(parent: Owner | undefined = currentOwner): Owner {
  return {
    parent,
    provides: new Map(),
  }
}

export function runWithOwner<T>(owner: Owner | undefined, fn: () => T): T {
  const previous = currentOwner
  currentOwner = owner

  try {
    return fn()
  } finally {
    currentOwner = previous
  }
}

export function createContext<T>(defaultValue?: T): Context<T> {
  const context: Context<T> = {
    id: Symbol(__DEV__ ? 'ZeusContext' : ''),
    defaultValue,

    Provider(props) {
      const owner = createOwner(currentOwner)
      owner.provides.set(context.id, props.value)

      return runWithOwner(owner, () => {
        const children = resolveValue(props.children)

        if (props.bridge) {
          return createDOMContextBoundary(context, props.value, children)
        }

        return children
      })
    },

    Bridge(props) {
      return createDOMContextBoundary(
        context,
        props.value,
        resolveValue(props.children),
      )
    },
  }

  return context
}

export function provide<T>(context: Context<T>, value: T): void {
  const owner = currentOwner

  if (!owner) {
    if (__DEV__) {
      console.warn(
        '[Zeus context] provide() was called without active component owner.',
      )
    }

    return
  }

  owner.provides.set(context.id, value)
}

export function inject<T>(context: Context<T>): T
export function inject<T>(context: Context<T>, fallback: T): T
export function inject<T>(context: Context<T>, fallback?: T): T {
  let owner = currentOwner

  while (owner) {
    if (owner.provides.has(context.id)) {
      return owner.provides.get(context.id) as T
    }

    owner = owner.parent
  }

  if (fallback !== undefined) {
    return fallback
  }

  if ('defaultValue' in context) {
    return context.defaultValue as T
  }

  throw new Error('[Zeus context] Context value was not provided.')
}

export const useContext = inject

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
```

> **关于 `null` fallback：** `insert()` 内部会跳过 `null` 节点，因此 `resolveValue` 返回 `null` 是安全的（相当于无 children）。这个 `?? null` 也与实际实现（`packages/runtime-dom/src/context.ts`）保持一致。

---

# 5. DOM Context Bridge

Web Component 不是普通 Zeus 组件调用，它内部的 `defineElement()` 是新的 render root。普通 owner tree 过不去，所以需要 DOM event 协议。

## 协议设计

Provider bridge 创建一个 DOM boundary：

```html
<zeus-context style="display: contents">
  <z-card></z-card>
</zeus-context>
```

Web Component connected 后向上冒泡：

```txt
zeus:context-request
```

最近的 context boundary 收到后返回 value。

---

## 完整 `context.ts` 代码草案（合并 Section 4 + Section 5）

> DOM bridge 相关代码已整合到 Section 4 的 `context.ts` 代码草案末尾（`ZEUS_CONTEXT_REQUEST` 到 `resolveValue`），包括：
>
> - `ZEUS_CONTEXT_REQUEST` 常量
> - `ZeusContextRequestDetail` / `ZeusContextRequestEvent` 类型
> - `createDOMContextBoundary` / `provideDOMContext` / `requestDOMContext` 函数
> - 完整的 `resolveValue` 实现（含 `null` fallback）

---

# 6. 修改 `createComponent`

当前 runtime-dom 有 `createComponent`，它需要接入 owner tree。

文件：

```txt
packages/runtime-dom/src/component.ts
```

改成：

```ts
import { createOwner, runWithOwner } from './context'

import type { JSXValue } from './types'

export function createComponent<
  P extends Record<string, unknown>,
  R extends JSXValue,
>(component: (props: P) => R, props: P): R {
  const owner = createOwner()

  return runWithOwner(owner, () => component(props))
}
```

这一步是普通组件 Context 生效的核心。

---

# 7. 修改 `render`

`render()` 应该创建 root owner。

文件：

```txt
packages/runtime-dom/src/render.ts
```

代码草案：

```ts
import { scope } from '@zeus-js/signal'

import { createOwner, runWithOwner } from './context'
import { insert } from './insert'

import type { JSXValue } from './types'

export interface RenderOptions {
  owner?: ReturnType<typeof createOwner>
}

export function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options: RenderOptions = {},
): () => void {
  const renderScope = scope()
  const owner = options.owner ?? createOwner()

  renderScope.run(() => {
    container.textContent = ''

    runWithOwner(owner, () => {
      insert(container, resolveValue(value))
    })
  })

  return () => {
    renderScope.stop()
    container.textContent = ''
  }
}

function resolveValue(value: JSXValue | (() => JSXValue)): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
```

> 与 `context.ts` 中的 `resolveValue` 保持一致：使用 `?? null` 处理 `undefined`。

---

# 8. 重要：compiler 需要把 component children 编译成 getter

这是 Context Provider 能工作的关键。

如果 `<Provider>` 的 children 被提前执行，那么 `useContext()` 会在 Provider 创建 owner 之前运行。

错误模式：

```ts
_createComponent(Provider, {
  value: theme,
  children: _createComponent(Child, {}),
})
```

这样 `Child` 已经先渲染了。

正确模式：

```ts
_createComponent(Provider, {
  value: theme,
  get children() {
    return _createComponent(Child, {})
  },
})
```

Provider 在自己的 owner 下读取 `props.children`，Child 才会在 Provider owner 下创建。

---

## 修改 `emitComponent.ts`

文件：

```txt
packages/compiler/src/codegen/dom/emitComponent.ts
```

核心修改：`children` prop 必须用 getter。

```ts
function emitComponentProp(
  prop: ComponentPropIR,
  context: CompilerContext,
): t.ObjectProperty | t.ObjectMethod {
  const key = createObjectKey(prop.name)

  if (Array.isArray(prop.value)) {
    return t.objectMethod(
      'get',
      key,
      [],
      t.blockStatement([
        t.returnStatement(emitChildrenProp(prop.value, context)),
      ]),
    )
  }

  if (isStaticPropValue(prop.value)) {
    return t.objectProperty(key, prop.value)
  }

  return t.objectMethod(
    'get',
    key,
    [],
    t.blockStatement([t.returnStatement(prop.value)]),
  )
}
```

也就是说，组件动态 props 和 children 都建议 getter 化。静态 boolean props（如 `bridge={true}` 字面量）走 `isStaticPropValue` 路径生成普通属性，不影响功能。

这也符合前面你已经采用的“动态组件 props 使用 getter”方向。

---

# 9. 修改 `defineElement` 支持 consumes

你当前 `@zeus-js/zeus` 已经导出 `defineElement / Host / Slot`。

现在给 `defineElement()` 加 Context 消费能力。

## 类型设计

文件：

```txt
packages/runtime-dom/src/customElement.ts
```

增加：

```ts
import {
  createOwner,
  requestDOMContext,
  runWithOwner,
  type Context,
  type Owner,
} from './context'
```

扩展 options：

```ts
export interface DefineElementOptions<P extends Record<string, unknown>> {
  shadow?: boolean | ShadowRootInit
  props?: PropOptions<P>
  styles?: string | string[]

  /**
   * Contexts consumed from parent DOM tree.
   * Used to bridge Zeus context into native custom elements.
   */
  consumes?: Context<any>[]
}
```

## connectedCallback 中创建 owner

```ts
private owner?: Owner

connectedCallback(): void {
  if (this.dispose) return

  const owner = createOwner()
  this.owner = owner

  for (const context of options.consumes ?? []) {
    const value = requestDOMContext(this, context)

    if (value !== undefined) {
      owner.provides.set(context.id, value)
    } else if ('defaultValue' in context) {
      owner.provides.set(context.id, context.defaultValue)
    }
  }

  // 后续原来的 target / hostContext / setupContext 保持

  this.dispose = render(
    () =>
      runWithOwner(owner, () =>
        withHostContext(hostContext, () =>
          setup(this.props as Readonly<P>, setupContext),
        ),
      ),
    target,
    {
      owner,
    },
  )
}
```

注意：如果 `render()` 已经接收 owner，这里可以只传 `options.owner`，不要双重创建。简单版本可以：

```ts
this.dispose = render(
  () =>
    withHostContext(hostContext, () =>
      setup(this.props as Readonly<P>, setupContext),
    ),
  target,
  {
    owner,
  },
)
```

因为 `render()` 内部会 `runWithOwner(owner, ...)`。

---

# 10. runtime-dom index 导出

文件：

```txt
packages/runtime-dom/src/index.ts
```

增加：

```ts
export {
  createContext,
  useContext,
  provide,
  inject,
  getCurrentOwner,
  createOwner,
  runWithOwner,
  provideDOMContext,
  requestDOMContext,
  ZEUS_CONTEXT_REQUEST,
  type Context,
  type Owner,
  type ContextProviderProps,
  type ContextBridgeProps,
} from './context'
```

---

# 11. zeus 主入口导出

文件：

```txt
packages/zeus/src/index.ts
```

增加：

```ts
export {
  createContext,
  useContext,
  provide,
  inject,
} from '@zeus-js/runtime-dom'

export type {
  Context,
  ContextProviderProps,
  ContextBridgeProps,
} from '@zeus-js/runtime-dom'
```

用户就可以：

```ts
import { createContext, useContext } from '@zeus-js/zeus'
```

---

# 12. JSX 类型补充

## 当前状态

Zeus 的 JSX 类型系统目前通过 `IntrinsicElements` catch-all 覆盖自定义标签：

```150:203:packages/zeus/src/jsx.d.ts
    interface IntrinsicElements {
      // ... 内置元素 ...
      [name: string]: Record<string, unknown>   // ← catch-all
    }
```

这意味着 `<ThemeContext.Provider>` 这样的 JSX 在 TypeScript 下**没有类型检查**——它匹配 catch-all，返回 `Record<string, unknown>`，props 随意传都不会报错。

## 推荐方案

有两种修复路径，各有权衡：

### 方案 A：逐个注册（推荐 MVP 阶段）

为常用的 Context Provider 手动注册到 `IntrinsicElements`：

```ts
// packages/zeus/src/jsx.d.ts
type CommonDOMAttributes<T extends Element> = {
  /* ... 保持不变 ... */
}

type HTMLAttributes<T extends HTMLElement> = CommonDOMAttributes<T> & {
  [key: `data-${string}`]: PrimitiveAttr
  [key: `aria-${string}`]: PrimitiveAttr
  [key: `prop:${string}`]: unknown
  // ... 其他属性 ...
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // ... 内置元素 ...
      // Context Provider 使用 catch-all，不强制要求注册
      [name: string]: Record<string, unknown>
    }
  }
}
```

> 实际上，由于 `Context.Provider` 本身是一个普通函数（`createContext()` 返回对象上的方法），编译器会把 `<Context.Provider value={x}>children</Context.Provider>` 编译为 `Context.Provider({ value: x, children })` 调用。这种调用**不经过 `IntrinsicElements`**，所以 catch-all 对 Provider 类型检查没有影响。
>
> 真正受影响的是 `<Provider>` 的**使用侧**——即当用户写 `<MyCtx.Provider>` 时，TypeScript 不知道这个标签应该有什么 props。但编译器生成的代码是函数调用表达式（`MyCtx.Provider({ value: ... })`），所以**运行时的类型检查完全依赖用户的类型声明**。

### 方案 B：改进编译器生成代码的类型表达（长期）

编译器生成 `Context.Provider({ value, children: ... })` 时，可以通过 JSDoc 类型注解或 TypeScript 参数化函数来增强类型表达：

```ts
// 在编译器输出中，对 Context Provider 调用添加类型断言
;(_ctx$Provider as (props: { value: T; children?: unknown }) => unknown)({
  value: theme,
  get children() {
    return _createComponent(Child, {})
  },
})
```

但这个方向成本较高，MVP 阶段可以接受现状。

## 实际影响分析

对用户的实际影响：

| 场景                  | 类型检查        | 编译器输出                            | 运行时  |
| --------------------- | --------------- | ------------------------------------- | ------- |
| 普通函数组件          | ❌ 依赖用户类型 | `createComponent(Fn, { ... })`        | ✅ 正常 |
| `<MyCtx.Provider>`    | ❌ catch-all    | `MyCtx.Provider({ value, children })` | ✅ 正常 |
| 内置元素 `div/button` | ✅ 有类型       | DOM 操作                              | ✅ 正常 |

**结论**：由于编译器始终生成函数调用表达式（而非 JSX 元素字面量），Context Provider 的类型安全主要取决于**用户是否正确标注了 `createContext<T>()` 的泛型**。当前 catch-all 不会导致运行时错误，只是让 Provider 的 JSX 用法失去 IDE 自动补全和类型检查。

## 编译器如何识别 Context.Provider？

编译器（`lowerComponent.ts`）在解析 JSX 时，将 `<ThemeContext.Provider>` 当作**普通组件调用**处理：

1. `<ThemeContext.Provider ...>` 被解析为 `callee = ThemeContext.Provider`
2. 编译器生成的代码等价于 `ThemeContext.Provider({ value: ..., children: ... })`
3. `createComponent` 在 `jsx-runtime.ts` 中会执行 `createComponent(type, props)` — 但 `Context.Provider` 不是普通组件

关键问题：`jsx-runtime.ts` 中的 `createJSXNode` 会对**所有函数类型**调用 `createComponent`：

```1:36:packages/zeus/src/jsx-runtime.ts
export function jsxs(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  return createJSXNode(type, props)
}

function createJSXNode(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  if (typeof type === 'function') {
    return createComponent(
      type as (props: Record<string, unknown>) => JSXValue,
      props ?? {},
    )
  }
  // ...
}
```

`Context.Provider` 作为函数被传入后，`createComponent` 会：

1. 创建新的 owner
2. 调用 `Provider(props)`
3. Provider 内部再创建自己的 owner（双重 owner）

**这是一个 bug**：`Context.Provider` 不应该再通过 `createComponent` 包装，因为它自己已经是 owner 创建的边界。编译器应该直接调用 `Context.Provider(props)`，而不是 `createComponent(Context.Provider, props)`。

### 编译器修复方案

编译器需要在生成组件调用代码时，识别 `Provider` 和 `Bridge` 是**上下文边界组件**，直接调用而不经过 `createComponent`：

```ts
// emitComponent.ts 伪代码
function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  const callee = node.callee

  // 如果 callee 是 Context.Provider 或 Context.Bridge，直接调用
  if (isContextBoundaryCallee(callee, context)) {
    return t.callExpression(callee, [
      t.objectExpression(
        node.props.map(prop => emitComponentProp(prop, context)),
      ),
    ])
  }

  return t.callExpression(context.importRuntime('createComponent'), [
    callee,
    t.objectExpression(
      node.props.map(prop => emitComponentProp(prop, context)),
    ),
  ])
}
```

> 这是一个**编译器需要实现的重要改动**。目前的 `emitComponent.ts` 对所有组件统一使用 `createComponent` 包装，Context Provider 会产生双重 owner 创建。实现时请参考 `isContextBoundaryCallee` 的具体实现策略。

---

# 13. 示例：普通组件 Context

```tsx
import { createContext, render, state, useContext } from '@zeus-js/zeus'

const CountContext = createContext<{
  count: { value: number }
  inc: () => void
}>()

function App() {
  const count = state(0)

  const store = {
    count,
    inc() {
      count.value++
    },
  }

  return (
    <CountContext.Provider value={store}>
      <Counter />
    </CountContext.Provider>
  )
}

function Counter() {
  const store = useContext(CountContext)

  return <button onClick={store.inc}>{store.count.value}</button>
}

render(() => <App />, document.getElementById('root')!)
```

---

# 14. 示例：Web Component 消费 Context

```tsx
import {
  Host,
  Slot,
  createContext,
  defineElement,
  render,
  state,
  useContext,
} from '@zeus-js/zeus'

const ThemeContext = createContext<{
  mode: 'light' | 'dark'
}>()

defineElement(
  'z-panel',
  {
    shadow: false,
    consumes: [ThemeContext],
  },
  () => {
    const theme = useContext(ThemeContext)

    return (
      <Host>
        <section class={{ dark: theme.mode === 'dark' }}>
          <Slot />
        </section>
      </Host>
    )
  },
)

function App() {
  const theme = state({
    mode: 'dark' as const,
  })

  return (
    <ThemeContext.Provider value={theme} bridge>
      <z-panel>
        <p>content</p>
      </z-panel>
    </ThemeContext.Provider>
  )
}

render(() => <App />, document.getElementById('root')!)
```

---

# 15. 测试设计

> ⚠️ 以下测试代码为**概念性测试**（architectural tests），用于说明测试思路和预期行为，**不能直接执行**。实际测试应使用浏览器环境（Vitest + JSDOM / Playwright）进行集成测试，因为 Context 依赖 DOM owner 和响应式 scope。

## 15.1 普通组件 Context（概念性）

```ts
import { describe, expect, it } from 'vitest'

import {
  createComponent,
  createContext,
  useContext,
} from '@zeus-js/runtime-dom'

describe('context', () => {
  // 注意：createComponent 返回 DOM 节点，不是字符串。
  // 正确做法是测试 DOM 结构或使用 DOM 测试工具（如 @testing-library/dom）。
  it('provides context to child components', async () => {
    const ThemeContext = createContext('light')

    function Child() {
      const theme = useContext(ThemeContext)
      // 验证 DOM 中包含正确的 context 值
      document.body.appendChild(
        <span data-theme={theme}>{theme}</span>
      )
      return document.querySelector('[data-theme]')!.getAttribute('data-theme')
    }

    function App() {
      return (
        <ThemeContext.Provider value="dark">
          <Child />
        </ThemeContext.Provider>
      )
    }

    const container = document.createElement('div')
    render(() => <App />, container)

    expect(container.querySelector('[data-theme]')!.getAttribute('data-theme')).toBe('dark')
  })
})
```

## 15.2 fallback default value（概念性）

```ts
it('uses default value when provider is missing', () => {
  const ThemeContext = createContext('light')

  function Child() {
    const theme = useContext(ThemeContext)
    return theme
  }

  const container = document.createElement('div')
  render(() => <Child />, container)

  // 不在 Provider 内，useContext 应返回 defaultValue
  expect(container.textContent).toBe('light')
})
```

## 15.3 inject fallback（概念性）

```ts
it('uses explicit inject fallback', () => {
  const ThemeContext = createContext<string>()

  function Child() {
    const value = inject(ThemeContext, 'fallback')
    return value
  }

  const container = document.createElement('div')
  render(() => <Child />, container)

  // 无 Provider 且无 defaultValue，inject 返回显式 fallback
  expect(container.textContent).toBe('fallback')
})
```

## 15.4 缺少 Provider 报错（概念性）

```ts
it('throws when context is missing without default', () => {
  const ThemeContext = createContext<{ mode: string }>() // 无 defaultValue

  function Child() {
    return useContext(ThemeContext) // 应抛错
  }

  const container = document.createElement('div')

  expect(() => {
    render(() => <Child />, container)
  }).toThrow()
})
```

## 15.5 Web Component DOM bridge（概念性）

```ts
it('bridges context to custom element through DOM event', () => {
  const ThemeContext = createContext<{ mode: string }>()

  const theme = {
    mode: 'dark',
  }

  // DOM boundary（模拟 Provider bridge 效果）
  const boundary = document.createElement('div')
  provideDOMContext(boundary, ThemeContext, theme)

  // 模拟 Web Component
  const child = document.createElement('z-child')
  boundary.appendChild(child)

  const received = requestDOMContext(child, ThemeContext)

  expect(received).toBe(theme)
})
```

## 15.6 For 循环中的 Context（概念性）

```ts
it('for loop items can access context', () => {
  const ListContext = createContext<{ items: string[] }>()

  function List() {
    return (
      <ListContext.Provider value={{ items: ['a', 'b', 'c'] }}>
        <For each={['x', 'y']}>
          {item => <ListItem item={item} />}
        </For>
      </ListContext.Provider>
    )
  }

  function ListItem({ item }: { item: string }) {
    const ctx = useContext(ListContext)
    return <li>{item}:{ctx.items.length}</li>
  }

  const container = document.createElement('div')
  render(() => <List />, container)

  const lis = container.querySelectorAll('li')
  expect(lis[0].textContent).toBe('x:3') // 'x' + 3 items
  expect(lis[1].textContent).toBe('y:3') // 'y' + 3 items
})
```

---

# 16. 注意事项

## 16.1 Provider 的 value 推荐传 reactive object

推荐：

```tsx
<ThemeContext.Provider value={theme}>
```

其中：

```ts
const theme = state({
  mode: 'dark',
})
```

不推荐：

```tsx
<ThemeContext.Provider value={theme.mode}>
```

因为这是 primitive snapshot，不会自动变成响应式。

如果确实要传 primitive，建议传 `state('dark')`：

```ts
const mode = state<'light' | 'dark'>('dark')

<ThemeContext.Provider value={mode}>
```

---

## 16.2 Provider children 必须 lazy

这是 compiler 必改点。

否则 Context 会失效。

```txt
children eagerly evaluated -> 错
children getter/lazy evaluated -> 对
```

---

## 16.3 Web Component 必须声明 consumes

为了避免所有 context 都通过 DOM event 查一遍，`defineElement` 需要显式声明：

```ts
consumes: [ThemeContext]
```

这样更清晰，也更好优化。

---

## 16.4 For 循环体内的 Context 行为

当前 MVP 实现中，`<For>` 循环体内使用 `useContext()` 是**可行的**，但有以下约束：

### 当前行为

`For` 循环的渲染函数在 `mountFor` / `updateFor` 中被同步调用。调用时，`currentOwner` 取决于父组件链。

```
Provider (owner A)
  └── For (共享父组件的 owner，即 owner A)
        └── 渲染函数调用 useContext() → 在 owner A 的链中查找 ✅
```

也就是说，如果 For 的渲染函数是普通函数（非组件），它会在**调用者**（父组件）的 owner 下执行，因此能正确访问 Provider 提供的 Context。

### 潜在问题

如果未来对 `<For>` 的每一项做独立 owner 隔离（比如为了更好的 cleanup），则需要显式为每一项创建 owner：

```ts
// 未来可能的演进：For 每项独立 owner
function updateFor(...) {
  for (const item of items()) {
    const itemOwner = createOwner(currentOwner)
    runWithOwner(itemOwner, () => {
      renderItem(item)
    })
  }
}
```

目前不需要这个改动，但应该在设计文档中说明这一限制。

### 建议

- **MVP 阶段**：For 循环体内可以使用 `useContext()`，正常工作。
- **未来演进**：如果需要在 For 每一项做独立的 cleanup 隔离，需要在 For 的渲染路径中为每项创建独立 owner。
- **不要**在 For 的渲染函数中调用 `provide()` —— 因为没有独立的 owner scope，`provide` 写入的是调用者的 owner，可能会污染其他项。

---

## 16.5 disconnectedCallback 中的 Owner 清理

`defineElement` 在 `disconnectedCallback` 中需要清理 owner 及其关联的响应式资源：

```ts
disconnectedCallback(): void {
  this.dispose?.()
  this.dispose = undefined
  this.owner = undefined   // owner.provides map 失去引用，等待 GC
}
```

`owner.provides` 的 Map 对象在 `owner` 变量被置为 `undefined` 后，如果没有其他引用，会被 GC 回收。Map 中注册的 context values（通常是响应式对象）如果也没有其他引用，同样会被 GC 回收。

关键点：`provideDOMContext` 在 boundary 上注册了 `zeus:context-request` 事件监听器，但这个监听器通过 `onScopeDispose(..., true)` 与响应式 scope 绑定。当 Web Component 断开连接时，`renderScope.stop()` 会被 `this.dispose?.()` 调用触发，进而清理所有 effect scope，包括事件监听器的 cleanup。

**因此不需要额外的手动 cleanup 代码**，现有的 `onScopeDispose` 机制已经覆盖了这个场景。

---

# 17. 最终 API 边界

主入口：

```ts
export {
  createContext,
  useContext,
  provide,
  inject,
} from '@zeus-js/runtime-dom'
```

高级 DOM bridge 可以先放主入口，也可以放 advanced：

```ts
export { provideDOMContext, requestDOMContext } from '@zeus-js/runtime-dom'
```

我的建议：

```txt
@zeus-js/zeus:
  createContext
  useContext
  provide
  inject

@zeus-js/zeus/advanced:
  provideDOMContext
  requestDOMContext
  getCurrentOwner
  runWithOwner
```

---

# 18. 实施顺序

```txt
1. 新增 runtime-dom/src/context.ts
2. createComponent 接入 Owner
3. render 接入 root Owner
4. compiler component children 改 getter
5. defineElement options 增加 consumes
6. runtime-dom index 导出 context API
7. zeus index 导出 createContext/useContext/provide/inject
8. [关键] 编译器修复：Context.Provider 不走 createComponent
   - emitComponent.ts 中增加 isContextBoundaryCallee 判断
   - Provider/Bridge 直接调用，不经过 createComponent 包装
   - 否则会产生双重 owner 创建
9. 补普通 Context 测试
10. 补 Web Component bridge 测试
11. 写 docs/guide/context.md
```

> **步骤 8 是 MVP 上线前必须完成的**。如果不修复，Context Provider 会产生双重 owner 创建，可能导致 context lookup 在某些边界情况下行为异常（Provider 创建的 owner 和 createComponent 创建的 owner 嵌套顺序错乱）。

---

# 19. 最终结论

Zeus 最适合的 Context 方案是：

```txt
外层 API 像 React：
  createContext()
  useContext()
  <Context.Provider value={...}>

底层能力像 Vue：
  provide()
  inject()

Web Component 通过 DOM bridge 兼容：
  <Context.Provider value={...} bridge>
    <z-card />
  </Context.Provider>

  defineElement('z-card', {
    consumes: [Context]
  }, ...)
```

这样能同时满足：

```txt
1. TSX 用户心智清晰
2. 编译型组件树 Context 高效
3. Vue-like 注入能力灵活
4. Web Component 跨 render root 可用
5. 后续插件系统也能复用 provide/inject
```

---

# 20. 已知的 jsx-runtime 技术债（低优先级）

`packages/zeus/src/jsx-runtime.ts` 中的 `createJSXNode` 对所有函数类型调用 `createComponent`：

```28:37:packages/zeus/src/jsx-runtime.ts
function createJSXNode(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  if (typeof type === 'function') {
    return createComponent(
      type as (props: Record<string, unknown>) => JSXValue,
      props ?? {},
    )
  }
```

这导致 `Context.Provider` 在非编译器路径（如 TypeScript 降级或手写 JSX 调用）下产生双重 owner：先是 `createComponent` 创建 ownerA，再是 `Provider` 内部创建 ownerB → ownerC。context 查找仍正确（因为 Provider 的 owner 在链上），但 owner 链层级变深。

**影响范围**：仅限不经过 Babel 编译器、直接使用 `jsx()` / `jsxs()` 函数的场景。实际用户通过 Babel/TS 编译的代码不受影响。

**未来可优化**：在 `createJSXNode` 中增加与 `emitComponent.ts` 相同的 `isContextBoundaryCallee` 判断，对 Provider/Bridge 直接调用。

**不阻塞 MVP 上线**：当前 MVP 核心用户路径（Babel 编译 JSX）已经正确。
