下面给一版**可以直接作为下一次提交目标**的详细设计与代码草案。核心目标是：**Context API 保持 React 风格主心智，底层保留 provide/inject，同时把 owner 生命周期、undefined 语义、Web Component bridge、compiler 特判风险一起修掉。**

---

# Phase：Context 稳定化设计

## 目标

```txt
1. Provider / createComponent 必须使用栈式 owner，不允许污染兄弟节点。
2. createContext(undefined)、inject(ctx, undefined) 必须是合法语义。
3. Web Component bridge 必须能区分“没找到”和“找到了 undefined”。
4. @zeus-js/zeus 主入口导出 useContext。
5. compiler 不再用 .Provider / .Bridge 名字猜测 context boundary。
6. 补充 owner 泄漏、undefined、DOM bridge 多 context 测试。
```

你现在的问题主要来自 `Provider` 里直接 `setCurrentOwner(owner)` 且不恢复 previous owner。当前代码注释明确说 Provider 不 restore owner。 这会让嵌套 Provider 之后的兄弟节点读到错误 context。

---

# 1. Owner 语义设计

## 正确模型

`currentOwner` 应该是一个**动态执行上下文**，类似调用栈：

```txt
runWithOwner(parent)
  App()
    Provider()
      runWithOwner(providerOwner)
        Child()
      restore parent
  restore previous
```

不能把 Provider owner 永久挂在全局 `currentOwner` 上。

## 修改点

### `packages/runtime-dom/src/component.ts`

当前 `createComponent` 手动 set/recover owner。 建议改成统一使用 `runWithOwner`。

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

这样有几个好处：

```txt
1. previous owner 一定恢复，不依赖 owner.parent。
2. 嵌套 component / Provider 的 owner 链更稳定。
3. 后面支持 async context 时也更容易统一。
```

---

# 2. Context 模块完整草案

## `packages/runtime-dom/src/context.ts`

重点变化：

```txt
1. Context 增加 hasDefaultValue。
2. Provider 使用 runWithOwner。
3. inject 使用 arguments.length 判断 fallback 是否存在。
4. DOM bridge 增加 resolveDOMContext()，用于区分 found/value。
5. requestDOMContext() 保持旧 API，返回 T | undefined。
```

代码草案：

```ts
// packages/runtime-dom/src/context.ts

import { onScopeDispose } from '@zeus-js/signal'

import { insert } from './insert'

import type { JSXValue } from './types'

export type ContextId = symbol

export interface Context<T = unknown> {
  readonly id: ContextId

  /**
   * The default value passed to createContext().
   *
   * Note:
   * - `defaultValue` itself may be `undefined`.
   * - Use `hasDefaultValue` to check whether a default value was provided.
   */
  readonly defaultValue: T | undefined
  readonly hasDefaultValue: boolean

  readonly Provider: ContextProvider<T>
  readonly Bridge: ContextBridge<T>
}

export interface ContextProviderProps<T> {
  value: T
  children?: JSXValue | (() => JSXValue)

  /**
   * When true, creates a DOM context boundary for native custom elements /
   * Web Components that live outside the Zeus owner tree.
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

/**
 * @internal
 *
 * Avoid using this in normal code.
 * Most runtime paths should use runWithOwner() so owner restoration is guaranteed.
 */
export function setCurrentOwner(owner: Owner | undefined): void {
  currentOwner = owner
}

export function createContext<T>(): Context<T>
export function createContext<T>(defaultValue: T): Context<T>
export function createContext<T>(defaultValue?: T): Context<T> {
  const hasDefaultValue = arguments.length > 0

  const context: Context<T> = {
    id: Symbol(__DEV__ ? 'ZeusContext' : ''),
    defaultValue,
    hasDefaultValue,

    Provider(props: ContextProviderProps<T>): JSXValue {
      const owner = createOwner(currentOwner)
      owner.provides.set(context.id, props.value)

      return runWithOwner(owner, () => {
        const children = resolveValue(props.children)

        if (props.bridge) {
          return createDOMContextBoundary(
            context as Context<unknown>,
            props.value,
            children,
          )
        }

        return children
      })
    },

    Bridge(props: ContextBridgeProps<T>): JSXValue {
      return createDOMContextBoundary(
        context as Context<unknown>,
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
        '[Zeus context] provide() was called without an active component owner.',
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

  // Important:
  // fallback can be undefined, so do not check `fallback !== undefined`.
  if (arguments.length >= 2) {
    return fallback as T
  }

  // Important:
  // defaultValue can be undefined, so use hasDefaultValue.
  if (context.hasDefaultValue) {
    return context.defaultValue as T
  }

  throw new Error(
    __DEV__
      ? `[Zeus context] No provider found for context.`
      : `Context value was not provided.`,
  )
}

export function useContext<T>(context: Context<T>): T
export function useContext<T>(context: Context<T>, fallback: T): T
export function useContext<T>(context: Context<T>, fallback?: T): T {
  if (arguments.length >= 2) {
    return inject(context, fallback as T)
  }

  return inject(context)
}

export const ZEUS_CONTEXT_REQUEST = 'zeus:context-request'

export interface ZeusContextRequestDetail<T = unknown> {
  id: ContextId
  resolved: boolean
  value?: T
  resolve: (value: T) => void
}

export type ZeusContextRequestEvent<T = unknown> = CustomEvent<
  ZeusContextRequestDetail<T>
>

export interface DOMContextResolution<T> {
  found: boolean
  value: T | undefined
}

export function createDOMContextBoundary<T>(
  context: Context<T>,
  value: T,
  children: JSXValue,
): Element {
  const boundary = document.createElement('zeus-context')

  ;(boundary as HTMLElement).style.cssText =
    'display:contents;position:unset;width:0;height:0;overflow:hidden'

  provideDOMContext(boundary, context, value)

  insert(boundary, children)

  return boundary
}

export function provideDOMContext<T>(
  target: EventTarget,
  context: Context<T>,
  value: T,
): void {
  const handler = (event: Event) => {
    const request = event as ZeusContextRequestEvent<T>

    if (request.type !== ZEUS_CONTEXT_REQUEST) return
    if (request.detail.id !== context.id) return

    request.stopPropagation()
    request.detail.resolve(value)
  }

  target.addEventListener(ZEUS_CONTEXT_REQUEST, handler as EventListener)

  onScopeDispose(() => {
    target.removeEventListener(ZEUS_CONTEXT_REQUEST, handler as EventListener)
  }, true)
}

/**
 * Internal precise DOM context resolver.
 *
 * Unlike requestDOMContext(), this can distinguish:
 * - found: false, value: undefined
 * - found: true, value: undefined
 */
export function resolveDOMContext<T>(
  host: HTMLElement,
  context: Context<T>,
): DOMContextResolution<T> {
  let found = false
  let value: T | undefined

  const event = new CustomEvent<ZeusContextRequestDetail<T>>(
    ZEUS_CONTEXT_REQUEST,
    {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {
        id: context.id,
        resolved: false,
        value: undefined,
        resolve(nextValue: T) {
          found = true
          value = nextValue
          this.resolved = true
          this.value = nextValue
        },
      },
    },
  )

  host.dispatchEvent(event)

  return { found, value }
}

/**
 * Public compatibility API.
 *
 * Returns the resolved value if found, otherwise undefined.
 * If you need to distinguish "not found" from "found undefined",
 * use resolveDOMContext().
 */
export function requestDOMContext<T>(
  host: HTMLElement,
  context: Context<T>,
): T | undefined {
  return resolveDOMContext(host, context).value
}

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
```

---

# 3. defineElement bridge 修复

你当前 `defineElement` 用 `value !== undefined` 判断 DOM context 是否存在。 这会导致 context value 本身是 `undefined` 时失效。

## 修改 `packages/runtime-dom/src/defineElement.ts`

把 import：

```ts
import { createOwner, requestDOMContext, runWithOwner } from './context'
```

改成：

```ts
import { createOwner, resolveDOMContext, runWithOwner } from './context'
```

然后把这段：

```ts
for (const context of options.consumes ?? []) {
  const value = requestDOMContext(this, context as Context<unknown>)

  if (value !== undefined) {
    owner.provides.set(context.id, value)
  } else if (context.defaultValue !== undefined) {
    owner.provides.set(context.id, context.defaultValue)
  }
}
```

改成：

```ts
for (const context of options.consumes ?? []) {
  const resolved = resolveDOMContext(this, context as Context<unknown>)

  if (resolved.found) {
    owner.provides.set(context.id, resolved.value)
  } else if (context.hasDefaultValue) {
    owner.provides.set(context.id, context.defaultValue)
  }
}
```

---

# 4. runtime-dom 导出调整

## `packages/runtime-dom/src/index.ts`

你现在已经导出了 context 主 API 和内部 API。 增加 `resolveDOMContext` 和类型。

```ts
// context — main user-facing APIs
export { createContext, useContext, provide, inject } from './context'

// context — advanced / internal APIs
export {
  getCurrentOwner,
  createOwner,
  runWithOwner,
  createDOMContextBoundary,
  provideDOMContext,
  requestDOMContext,
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
} from './context'
```

---

# 5. zeus 主入口导出 useContext

你当前 `@zeus-js/zeus` 只导出了 `createContext / provide / inject`，没有导出 `useContext`。 但设计文档主推的是 React 风格 `useContext`。

## `packages/zeus/src/index.ts`

改成：

```ts
// context — main user-facing APIs
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

---

# 6. compiler：删除 `.Provider / .Bridge` 特判

你当前 compiler 只要看到属性名是 `Provider` 或 `Bridge`，就直接调用，不走 `createComponent`。 这个判断太宽，可能误伤 `Router.Provider`、`SomeLib.Provider`。

关键是：**当 Provider 改成 runWithOwner 后，已经不需要 compiler 特判了。**

`_createComponent(Context.Provider, props)` 也能正常工作，只是多一层 component owner，但不影响 context lookup。

## `packages/compiler/src/codegen/dom/emitComponent.ts`

建议改回通用逻辑：

```ts
import * as t from '@babel/types'

import { emitNodeExpression } from './emitNodeExpression'

import type { CompilerContext } from '../../context'
import type { ComponentIR, ComponentPropIR, ZeusIRNode } from '../../ir/nodes'

export function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  const props = t.objectExpression(
    node.props.map(prop => emitComponentProp(prop, context)),
  )

  return t.callExpression(context.importRuntime('createComponent'), [
    node.callee,
    props,
  ])
}

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

export function emitChildrenProp(
  children: ZeusIRNode[],
  context: CompilerContext,
): t.Expression {
  const nodes = children.map(child => emitNodeExpression(child, context))

  if (nodes.length === 1) return nodes[0]
  return t.arrayExpression(nodes)
}

function isStaticPropValue(value: t.Expression): boolean {
  return (
    t.isStringLiteral(value) ||
    t.isNumericLiteral(value) ||
    t.isBooleanLiteral(value) ||
    t.isNullLiteral(value)
  )
}

function createObjectKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}
```

这一步会让 compiler 更干净，避免靠名字猜 API。

---

# 7. Web Component 多 Context bridge 用法修正

你当前示例中 `z-context-card` 声明消费 `ThemeContext` 和 `UserContext`。 但 JSX 只 bridge 了 `ThemeContext`，没有 bridge `UserContext`。

## `examples/context/src/main.tsx`

应该改成：

```tsx
<ThemeContext.Provider value={theme} bridge>
  <UserContext.Provider value={user} bridge>
    <z-context-card>
      <span slot="header">
        <UserBadge />
      </span>
      <p>Slotted content inside the Web Component.</p>
    </z-context-card>
  </UserContext.Provider>
</ThemeContext.Provider>
```

如果你觉得嵌套太丑，后续可以加一个批量 bridge 组件，但 MVP 阶段先不加 API，避免膨胀。

---

# 8. 可选增强：批量 DOM Context Bridge

这个不是必须，但后面 Web Component 用多 context 时会舒服很多。

## 新增 API 草案

```tsx
<DOMContextBridge
  values={[
    [ThemeContext, theme],
    [UserContext, user],
  ]}
>
  <z-context-card />
</DOMContextBridge>
```

## 实现草案

```ts
export interface DOMContextBridgeProps {
  values: readonly (readonly [Context<unknown>, unknown])[]
  children?: JSXValue | (() => JSXValue)
}

export function DOMContextBridge(props: DOMContextBridgeProps): JSXValue {
  const boundary = document.createElement('zeus-context')

  ;(boundary as HTMLElement).style.cssText =
    'display:contents;position:unset;width:0;height:0;overflow:hidden'

  for (const [context, value] of props.values) {
    provideDOMContext(boundary, context, value)
  }

  insert(boundary, resolveValue(props.children))

  return boundary
}
```

然后导出：

```ts
export { DOMContextBridge, type DOMContextBridgeProps } from './context'
```

不过我建议这个放到下一步，不要和本次稳定化混在一个 commit 里。

---

# 9. 必补测试

你现在已有 context 测试，但还缺最关键的 owner 泄漏测试。当前测试覆盖了普通 Provider、嵌套 Provider、DOM bridge。

## `packages/runtime-dom/__tests__/context.spec.ts`

新增：

```ts
it('does not leak nested provider owner to following siblings', () => {
  const AContext = createContext<string>()
  const BContext = createContext<string>()

  const seen: string[] = []

  function ReadB() {
    seen.push(inject(BContext, 'no-b'))
    return null
  }

  function App() {
    return AContext.Provider({
      value: 'a',
      get children() {
        return [
          BContext.Provider({
            value: 'b',
            get children() {
              return ReadB()
            },
          }),
          ReadB(),
        ]
      },
    })
  }

  createComponent(App, {})

  expect(seen).toEqual(['b', 'no-b'])
})
```

新增 undefined default 测试：

```ts
it('supports undefined as an explicit default value', () => {
  const Context = createContext<string | undefined>(undefined)

  expect(inject(Context)).toBeUndefined()
})

it('supports undefined as an explicit fallback value', () => {
  const Context = createContext<string | undefined>()

  expect(inject(Context, undefined)).toBeUndefined()
})
```

新增 DOM bridge undefined 测试：

```ts
it('DOM bridge supports undefined as a provided value', () => {
  const Context = createContext<string | undefined>('default')

  const boundary = document.createElement('div')
  provideDOMContext(boundary, Context, undefined)

  const child = document.createElement('z-child')
  boundary.appendChild(child)

  const resolved = resolveDOMContext(child as HTMLElement, Context)

  expect(resolved.found).toBe(true)
  expect(resolved.value).toBeUndefined()
})
```

新增 defineElement consumes default undefined 测试：

```ts
it('defineElement consumes undefined DOM context value instead of falling back to default', () => {
  const Context = createContext<string | undefined>('default')
  const received: Array<string | undefined> = []

  class TestElement extends HTMLElement {}

  const boundary = document.createElement('div')
  provideDOMContext(boundary, Context, undefined)

  const host = document.createElement('z-test')
  Object.setPrototypeOf(host, TestElement.prototype)

  boundary.appendChild(host)

  const resolved = resolveDOMContext(host as HTMLElement, Context)
  if (resolved.found) {
    received.push(resolved.value)
  }

  expect(received).toEqual([undefined])
})
```

这个测试不一定要直接测 `defineElement`，也可以只测 `resolveDOMContext`。如果要测 `defineElement`，需要 stub `customElements`，会复杂一点。

---

# 10. compiler snapshot 测试建议

删除 `.Provider/.Bridge` 特判后，要补一个 snapshot 确认所有组件都走 `_createComponent`。

期望输出大概是：

```ts
_createComponent(ThemeContext.Provider, {
  get value() {
    return theme
  },
  get children() {
    return _createComponent(Child, {})
  },
})
```

再补一个误伤用例：

```tsx
function App() {
  return <Router.Provider value={router} />
}
```

期望也走：

```ts
_createComponent(Router.Provider, {
  get value() {
    return router
  },
})
```

这样就不会因为名字叫 `Provider` 被特殊绕过。

---

# 11. 最终推荐提交拆分

不要一个 commit 全塞进去，建议拆成 4 个 commit：

```txt
commit 1:
fix(runtime-dom): restore owner stack for context provider

包含：
- context.ts Provider 改 runWithOwner
- component.ts 改 runWithOwner
- owner 泄漏测试

commit 2:
fix(runtime-dom): support undefined context values

包含：
- Context.hasDefaultValue
- inject fallback 判断
- resolveDOMContext
- defineElement consumes 改 resolved.found
- undefined 相关测试

commit 3:
fix(zeus): export useContext from public entry

包含：
- packages/zeus/src/index.ts
- docs/api/zeus.md 同步

commit 4:
fix(compiler): remove Provider Bridge name heuristic

包含：
- emitComponent.ts 删除 isContextBoundaryCallee
- compiler snapshot 测试
```

---

# 12. 当前优先级判断

```txt
P0 必须马上做：
1. Provider owner restore
2. createComponent runWithOwner
3. owner 泄漏测试

P1 本次一起做：
4. undefined default/fallback
5. resolveDOMContext
6. defineElement consumes 修复
7. zeus 导出 useContext
8. context example 多 bridge 修复

P2 稍后做：
9. DOMContextBridge 批量 bridge API
10. children getter memoize
11. context 跨 iframe/string id 设计
```

这版修完后，Context 这块可以算进入 **MVP 可用状态**。尤其是 `Provider` 的 owner restore 一定要先修，不然越往后写示例和组件，问题会越隐蔽。
