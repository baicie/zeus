# Phase 2：Runtime DOM MVP

> 状态：进行中
> 说明：详细设计草案。Phase 2 核心目标见 [`roadmap.md`](../roadmap.md) Phase 2 部分。

## 目标

Phase 2 的目标是：

```txt
让 Zeus 可以不用 Virtual DOM，直接通过 runtime-dom 完成：
1. 模板克隆
2. 静态 DOM 插入
3. 动态文本更新
4. 动态属性/DOM property 更新
5. 事件绑定
6. JSX ref 协议
7. Show / For 基础控制流
8. render / dispose 生命周期
```

Phase 2 结束后，下面这种代码应该能稳定跑：

```tsx
import { state } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'

function App() {
  const count = state(0)
  const user = state({ name: 'Zeus' })
  const input = state<HTMLInputElement | null>(null)

  return (
    <div>
      <input
        ref={input}
        value={user.name}
        onInput={e => (user.name = e.currentTarget.value)}
      />

      <button onClick={() => count.value++}>
        {user.name}: {count.value}
      </button>
    </div>
  )
}

render(() => <App />, document.getElementById('root')!)
```

---

# Phase 2 的边界

Phase 2 做：

```txt
template()
render()
insert()
bindText()
bindAttr()
bindProp()
bindStyle()
bindClass()
bindEvent()
bindRef()
mountShow()
mountFor()
cleanup/dispose
```

Phase 2 不做：

```txt
Keyed For diff
SSR hydration
Suspense
Transition
Portal
Context
ErrorBoundary
Web Components Host/Slot
事件委托高级优化
```

这些放后面。

---

# Runtime DOM 目录结构建议

当前 `runtime-dom/src/index.ts` 内容已经比较多，Phase 2 建议拆开：

```txt
packages/runtime-dom/src/
  index.ts

  types.ts          # JSXValue / Component / RefTarget 等类型
  template.ts       # template()
  render.ts         # render()
  insert.ts         # insert / mountDynamic / removeRange
  bindings.ts       # bindText / bindAttr / bindProp / bindClass / bindStyle
  events.ts         # bindEvent / delegateEvents 预留
  refs.ts           # setRef / bindRef
  controlFlow.ts    # Show / For / mountShow / mountFor
  component.ts      # createComponent()
  dom.ts            # child / marker / utility
```

---

# Phase 2 Public API

`runtime-dom` 对 compiler 暴露这些 helper：

```ts
export {
  template,
  render,
  insert,
  bindText,
  bindAttr,
  bindProp,
  bindClass,
  bindStyle,
  bindEvent,
  bindRef,
  marker,
  child,
  createComponent,
  Show,
  For,
  mountShow,
  mountFor,
}
```

其中 compiler 当前 snapshot 已经会生成类似：

```ts
_template(...)
_insert(...)
_bindText(...)
_createComponent(...)
_marker(...)
```

所以这些函数的名字要稳定，不要频繁改。当前 compiler snapshot 里已经依赖这些 runtime helper。

---

# 1. types.ts

```ts
// packages/runtime-dom/src/types.ts

export type JSXPrimitive = string | number | boolean | null | undefined

export type JSXValue = JSXPrimitive | Node | JSXValue[]

export type JSXGetter = () => JSXValue

export type Component<
  P extends Record<string, unknown> = Record<string, unknown>,
> = (props: P) => JSXValue

export type TemplateFactory<T extends Node = Node> = () => T

export type AttrValue = string | number | boolean | null | undefined

export type ClassValue =
  | string
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>
  | Array<ClassValue>

export type StyleValue =
  | string
  | null
  | undefined
  | Partial<CSSStyleDeclaration>
  | Record<string, string | number | null | undefined>

export type RefTarget<T> =
  | ((value: T | null) => void)
  | { value: T | null }
  | { current: T | null }
```

---

# 2. template.ts

当前 `template()` 已经是用 `<template>` 克隆。

Phase 2 可以先保持简单：

```ts
// packages/runtime-dom/src/template.ts

import type { TemplateFactory } from './types'

export function template<T extends Node = Node>(
  html: string,
  _isImportNode = false,
  _isSVG = false,
  _isMathML = false,
): TemplateFactory<T> {
  const t = document.createElement('template')
  t.innerHTML = html

  return function clone(): T {
    return t.content.cloneNode(true) as T
  }
}
```

后续 Phase 6 再优化 SVG/MathML/importNode 细节。

---

# 3. dom.ts

```ts
// packages/runtime-dom/src/dom.ts

export function marker(parent: ParentNode, index: number): Comment {
  let seen = 0

  for (const node of parent.childNodes) {
    if (node.nodeType !== Node.COMMENT_NODE) continue

    const comment = node as Comment

    if (comment.data !== '' && comment.data !== '!') continue
    if (seen === index) return comment

    seen++
  }

  throw new Error(`[Zeus runtime] marker ${index} not found`)
}

export function child(parent: ParentNode, index: number): ChildNode {
  const node = parent.childNodes.item(index)

  if (!node) {
    throw new Error(`[Zeus runtime] child ${index} not found`)
  }

  return node as ChildNode
}

export function removeNodes(nodes: readonly Node[]): void {
  for (const node of nodes) {
    node.parentNode?.removeChild(node)
  }
}
```

你当前 runtime 已经有 `marker()` 和 `child()`，可以迁移过来。

---

# 4. insert.ts

Phase 2 的 `insert()` 要解决两个场景：

```txt
1. 静态插入：insert(parent, node, marker)
2. 动态插入：mountDynamic(parent, marker, getter)
```

代码：

```ts
// packages/runtime-dom/src/insert.ts

import { effect, onScopeDispose, stop } from '@zeus-js/signal'

import { removeNodes } from './dom'
import type { JSXValue } from './types'

export function insert(
  parent: Node,
  value: JSXValue,
  marker: Node | null = null,
): void {
  if (value === undefined) {
    if (__DEV__) {
      console.warn(
        '[Zeus runtime] insert received `undefined`, which is ignored. ' +
          'Use `null` explicitly if you want to render nothing.',
      )
    }
    return
  }

  insertValue(parent, value, marker)
}

export function mountDynamic(
  parent: Node,
  marker: Node,
  value: () => JSXValue,
): void {
  let current: Node[] = []

  const runner = effect(() => {
    removeNodes(current)
    current = insertTracked(parent, value(), marker)
  })

  onScopeDispose(() => {
    stop(runner)
    removeNodes(current)
    current = []
  }, true)
}

function insertValue(parent: Node, value: JSXValue, marker: Node | null): void {
  if (value == null || value === false || value === true) return

  if (Array.isArray(value)) {
    for (const item of value) {
      insertValue(parent, item, marker)
    }
    return
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  parent.insertBefore(node, marker)
}

function insertTracked(
  parent: Node,
  value: JSXValue,
  marker: Node | null,
): Node[] {
  if (
    value === undefined ||
    value == null ||
    value === false ||
    value === true
  ) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(item => insertTracked(parent, item, marker))
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  parent.insertBefore(node, marker)

  return [node]
}
```

你当前 `mountDynamic()` 已经是“删除旧节点，再插入新节点”的模型，Phase 2 可以继续用这个 MVP，后续 Phase 6 再做 diff。

---

# 5. bindings.ts

## 5.1 文本绑定

```ts
// packages/runtime-dom/src/bindings.ts

import { effect } from '@zeus-js/signal'

import type { AttrValue, ClassValue, JSXValue, StyleValue } from './types'

export function bindText(node: Text, value: () => JSXValue): void {
  effect(() => {
    const next = value()

    node.data =
      next == null || next === false || next === true ? '' : String(next)
  })
}
```

当前 runtime-dom 已经有类似实现。

---

## 5.2 属性绑定

```ts
export function setAttr(el: Element, name: string, value: AttrValue): void {
  if (value == null || value === false) {
    el.removeAttribute(normalizeAttrName(name))
    return
  }

  const attrName = normalizeAttrName(name)

  if (value === true) {
    el.setAttribute(attrName, '')
    return
  }

  el.setAttribute(attrName, String(value))
}

export function bindAttr(
  el: Element,
  name: string,
  value: () => AttrValue,
): void {
  effect(() => {
    setAttr(el, name, value())
  })
}

function normalizeAttrName(name: string): string {
  return name === 'className' ? 'class' : name
}
```

---

## 5.3 DOM property 绑定

```ts
export function bindProp<T extends Element, K extends keyof T>(
  el: T,
  name: K,
  value: () => T[K],
): void {
  effect(() => {
    el[name] = value()
  })
}
```

当前 runtime-dom 已经有 `bindProp()`，这个可以保留。

---

## 5.4 class 绑定

支持：

```tsx
<div class="a" />
<div className="a" />
<div class={{ active: state.active }} />
<div class={['a', condition && 'b']} />
```

代码：

```ts
export function bindClass(el: Element, value: () => ClassValue): void {
  effect(() => {
    const next = normalizeClass(value())
    if (next) {
      el.setAttribute('class', next)
    } else {
      el.removeAttribute('class')
    }
  })
}

export function normalizeClass(value: ClassValue): string {
  if (!value) return ''

  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(' ')
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .filter(key => value[key])
      .join(' ')
  }

  return ''
}
```

---

## 5.5 style 绑定

支持：

```tsx
<div style="color:red" />
<div style={{ color: 'red', width: 100 }} />
```

代码：

```ts
export function bindStyle(
  el: HTMLElement | SVGElement,
  value: () => StyleValue,
): void {
  let prev: Record<string, string | number | null | undefined> | undefined

  effect(() => {
    const next = value()

    if (next == null) {
      el.removeAttribute('style')
      prev = undefined
      return
    }

    if (typeof next === 'string') {
      el.setAttribute('style', next)
      prev = undefined
      return
    }

    patchStyle(el, prev, next)
    prev = next
  })
}

function patchStyle(
  el: HTMLElement | SVGElement,
  prev: Record<string, string | number | null | undefined> | undefined,
  next: Record<string, string | number | null | undefined>,
): void {
  const style = (el as HTMLElement).style

  if (prev) {
    for (const key in prev) {
      if (!(key in next)) {
        style.setProperty(toKebabCase(key), '')
      }
    }
  }

  for (const key in next) {
    const value = next[key]
    const name = toKebabCase(key)

    if (value == null) {
      style.setProperty(name, '')
    } else {
      style.setProperty(name, normalizeStyleValue(key, value))
    }
  }
}

function normalizeStyleValue(key: string, value: string | number): string {
  if (typeof value === 'number' && value !== 0 && !isUnitlessNumber(key)) {
    return `${value}px`
  }

  return String(value)
}

const unitlessNumbers = new Set([
  'opacity',
  'zIndex',
  'fontWeight',
  'lineHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
])

function isUnitlessNumber(key: string): boolean {
  return unitlessNumbers.has(key)
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}
```

---

# 6. events.ts

Phase 2 先做直接绑定，不做复杂事件委托。

```ts
// packages/runtime-dom/src/events.ts

import { onScopeDispose } from '@zeus-js/signal'

export function bindEvent<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  name: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void
export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void
export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void {
  el.addEventListener(name, handler)

  onScopeDispose(() => {
    el.removeEventListener(name, handler)
  }, true)
}
```

当前 runtime 只有 `addEventListener`，没有清理。Phase 2 要加 `onScopeDispose`，避免组件销毁后事件泄漏。

后面 Phase 6 再做：

```ts
delegateEvents(['click', 'input'])
```

注意：当前 compiler support 里已经有 `delegateEvents` 注入逻辑，但 runtime 目前没有对应实现。Phase 2 要么先不启用 delegateEvents，要么提供一个空实现，避免生成代码缺失。

建议先加一个保底：

```ts
const delegated = new Set<string>()

export function delegateEvents(events: readonly string[]): void {
  for (const event of events) {
    delegated.add(event)
  }
}
```

---

# 7. refs.ts

Phase 1 里定了：不提供 `domRef()`，DOM ref 是 JSX 属性协议。

Phase 2 runtime 负责实现：

```tsx
<input ref={input} />
```

```ts
// packages/runtime-dom/src/refs.ts

import { onScopeDispose } from '@zeus-js/signal'

import type { RefTarget } from './types'

export function setRef<T>(
  target: RefTarget<T> | null | undefined,
  value: T | null,
): void {
  if (target == null) return

  if (typeof target === 'function') {
    target(value)
    return
  }

  if ('value' in target) {
    target.value = value
    return
  }

  if ('current' in target) {
    target.current = value
    return
  }

  if (__DEV__) {
    console.warn('[Zeus runtime] invalid ref target:', target)
  }
}

export function bindRef<T extends Element>(
  el: T,
  target: RefTarget<T> | null | undefined,
): void {
  setRef(target, el)

  onScopeDispose(() => {
    setRef(target, null)
  }, true)
}
```

支持：

```tsx
const input = state<HTMLInputElement | null>(null)
<input ref={input} />

<input ref={el => console.log(el)} />

const input = { current: null }
<input ref={input} />
```

---

# 8. component.ts

```ts
// packages/runtime-dom/src/component.ts

import type { JSXValue } from './types'

export function createComponent<
  P extends Record<string, unknown>,
  R extends JSXValue,
>(component: (props: P) => R, props: P): R {
  return component(props)
}
```

当前已有 `createComponent()`，Phase 2 可以继续保持。

后续 Phase 3/4 再考虑组件 scope 独立化。

---

# 9. controlFlow.ts

## 9.1 Show

```ts
// packages/runtime-dom/src/controlFlow.ts

import { mountDynamic } from './insert'
import type { JSXValue } from './types'

export type ShowProps = {
  when: unknown
  fallback?: JSXValue | (() => JSXValue)
  children?: JSXValue | (() => JSXValue)
}

export function Show(props: ShowProps): JSXValue {
  return props.when
    ? resolveValue(props.children)
    : resolveValue(props.fallback)
}

export function mountShow(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  fallback?: () => JSXValue,
): void {
  mountDynamic(parent, marker, () =>
    when() ? children() : fallback ? fallback() : null,
  )
}

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : value
}
```

当前 runtime 已经有 `Show` 和 `mountShow()`。

---

## 9.2 For

Phase 2 的 For 先做最简单版本：数组变化全量重渲染。

```ts
export type ForProps<T> = {
  each: readonly T[] | null | undefined
  children: (item: T, index: number) => JSXValue
}

export function For<T>(props: ForProps<T>): JSXValue {
  return props.each?.map((item, index) => props.children(item, index)) ?? null
}

export function mountFor<T>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  mountDynamic(
    parent,
    marker,
    () => each()?.map((item, index) => render(item, index)) ?? null,
  )
}
```

当前 runtime 也是这个方向。

后续 Phase 6 再做 keyed diff：

```tsx
<For each={list} by={item => item.id}>
  {item => <div>{item.name}</div>}
</For>
```

---

# 10. render.ts

当前 `render()` 已经用 `effectScope()` 包住插入逻辑，并返回 dispose。

Phase 2 可以调整为：

```ts
// packages/runtime-dom/src/render.ts

import { scope } from '@zeus-js/signal'

import { insert } from './insert'
import type { JSXValue } from './types'

export function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
): () => void {
  const renderScope = scope()

  renderScope.run(() => {
    container.textContent = ''
    insert(container, resolveValue(value))
  })

  return () => {
    renderScope.stop()
    container.textContent = ''
  }
}

function resolveValue(value: JSXValue | (() => JSXValue)): JSXValue {
  return typeof value === 'function' ? value() : value
}
```

注意：这里依赖 Phase 1 的 `scope()`。如果 Phase 1 还没把 `scope()` 导出，可以暂时继续用 `effectScope()`。

---

# 11. index.ts

最终统一导出：

```ts
// packages/runtime-dom/src/index.ts

export type {
  JSXValue,
  JSXGetter,
  Component,
  TemplateFactory,
  AttrValue,
  ClassValue,
  StyleValue,
  RefTarget,
} from './types'

export { template } from './template'

export { render } from './render'

export { insert, mountDynamic } from './insert'

export { marker, child } from './dom'

export {
  bindText,
  bindAttr,
  bindProp,
  bindClass,
  bindStyle,
  setAttr,
  normalizeClass,
} from './bindings'

export { bindEvent, delegateEvents } from './events'

export { setRef, bindRef } from './refs'

export { createComponent } from './component'

export {
  Show,
  For,
  mountShow,
  mountFor,
  type ShowProps,
  type ForProps,
} from './controlFlow'
```

---

# 12. compiler 联动要求

虽然 Phase 2 主要是 runtime，但 compiler 要能调用这些 helper。

当前 compiler 的 `emitBinding.ts` 已经会生成：

```txt
bindAttr
bindEvent
bindProp
bindText
insert
mountShow
mountFor
```

这些函数必须保持稳定。

Phase 2 需要额外让 compiler 后面能生成：

```ts
_bindClass(el, () => expr)
_bindStyle(el, () => expr)
_bindRef(el, expr)
```

也就是说：

```txt
class / className -> bindClass
style object      -> bindStyle
ref               -> bindRef
```

如果 compiler 暂时还没接，runtime 也可以先写好。

---

# 13. package.json 调整

当前 `runtime-dom/package.json` 用的是 `tsup`，和 root build 不完全统一。

Phase 2 建议改成和其他包一样：

```json
{
  "name": "@zeus-js/runtime-dom",
  "version": "0.0.1",
  "type": "module",
  "main": "index.js",
  "module": "dist/runtime-dom.esm-bundler.js",
  "types": "dist/runtime-dom.d.ts",
  "unpkg": "dist/runtime-dom.global.js",
  "jsdelivr": "dist/runtime-dom.global.js",
  "files": ["index.js", "dist"],
  "exports": {
    ".": {
      "types": "./dist/runtime-dom.d.ts",
      "node": {
        "production": "./dist/runtime-dom.cjs.prod.js",
        "development": "./dist/runtime-dom.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/runtime-dom.esm-bundler.js",
      "import": "./dist/runtime-dom.esm-bundler.js",
      "require": "./index.js"
    },
    "./*": "./*"
  },
  "sideEffects": false,
  "buildOptions": {
    "name": "ZeusRuntimeDOM",
    "formats": ["esm-bundler", "esm-browser", "cjs", "global"]
  },
  "dependencies": {
    "@zeus-js/signal": "workspace:*"
  }
}
```

---

# 14. 测试规划

新增：

```txt
packages/runtime-dom/__tests__/
  template.spec.ts
  insert.spec.ts
  bindings.spec.ts
  events.spec.ts
  refs.spec.ts
  render.spec.ts
  controlFlow.spec.ts
```

---

## 14.1 bindings.spec.ts

```ts
import { describe, expect, it } from 'vitest'
import { state } from '@zeus-js/signal'

import { bindText, bindAttr, bindClass, bindStyle } from '../src'

describe('runtime bindings', () => {
  it('binds text reactively', () => {
    const count = state(0)
    const text = document.createTextNode('')

    bindText(text, () => count.value)

    expect(text.data).toBe('0')

    count.value++

    expect(text.data).toBe('1')
  })

  it('binds attr reactively', () => {
    const title = state('hello')
    const el = document.createElement('div')

    bindAttr(el, 'title', () => title.value)

    expect(el.getAttribute('title')).toBe('hello')

    title.value = 'world'

    expect(el.getAttribute('title')).toBe('world')
  })

  it('binds class object', () => {
    const active = state(false)
    const el = document.createElement('div')

    bindClass(el, () => ({
      active: active.value,
    }))

    expect(el.getAttribute('class')).toBeNull()

    active.value = true

    expect(el.getAttribute('class')).toBe('active')
  })

  it('binds style object', () => {
    const width = state(100)
    const el = document.createElement('div')

    bindStyle(el, () => ({
      width: width.value,
    }))

    expect(el.style.width).toBe('100px')

    width.value = 200

    expect(el.style.width).toBe('200px')
  })
})
```

---

## 14.2 refs.spec.ts

```ts
import { describe, expect, it, vi } from 'vitest'
import { scope, state } from '@zeus-js/signal'

import { bindRef, setRef } from '../src'

describe('runtime refs', () => {
  it('sets value holder ref', () => {
    const input = state<HTMLInputElement | null>(null)
    const el = document.createElement('input')

    setRef(input, el)

    expect(input.value).toBe(el)
  })

  it('sets callback ref', () => {
    const fn = vi.fn()
    const el = document.createElement('input')

    setRef(fn, el)

    expect(fn).toHaveBeenCalledWith(el)
  })

  it('sets current object ref', () => {
    const ref = { current: null as HTMLInputElement | null }
    const el = document.createElement('input')

    setRef(ref, el)

    expect(ref.current).toBe(el)
  })

  it('clears ref on scope dispose', () => {
    const input = state<HTMLInputElement | null>(null)
    const el = document.createElement('input')
    const s = scope()

    s.run(() => {
      bindRef(el, input)
    })

    expect(input.value).toBe(el)

    s.stop()

    expect(input.value).toBe(null)
  })
})
```

---

## 14.3 render.spec.ts

```ts
import { describe, expect, it } from 'vitest'
import { state } from '@zeus-js/signal'

import { bindText, render } from '../src'

describe('render', () => {
  it('renders node into container', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    render(el, container)

    expect(container.firstChild).toBe(el)
  })

  it('disposes rendered content', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    const dispose = render(el, container)

    expect(container.firstChild).toBe(el)

    dispose()

    expect(container.firstChild).toBeNull()
  })

  it('stops effects after dispose', () => {
    const container = document.createElement('div')
    const count = state(0)
    const text = document.createTextNode('')

    const dispose = render(() => {
      bindText(text, () => count.value)
      return text
    }, container)

    expect(text.data).toBe('0')

    dispose()

    count.value++

    expect(text.data).toBe('0')
  })
})
```

---

# 15. Phase 2 任务拆分

## Phase 2.1：runtime-dom 拆模块

```txt
- 拆出 types.ts
- 拆出 template.ts
- 拆出 insert.ts
- 拆出 bindings.ts
- 拆出 events.ts
- 拆出 refs.ts
- 拆出 render.ts
- 拆出 controlFlow.ts
```

---

## Phase 2.2：绑定系统完善

```txt
- bindText
- bindAttr
- bindProp
- bindClass
- bindStyle
- setAttr
- normalizeClass
- patchStyle
```

---

## Phase 2.3：事件系统 MVP

```txt
- bindEvent addEventListener
- scope dispose 时 removeEventListener
- delegateEvents 空实现或最小实现，避免 compiler 生成缺失
```

---

## Phase 2.4：JSX ref runtime 协议

```txt
- setRef()
- bindRef()
- 支持 value/current/callback
- scope dispose 置 null
```

---

## Phase 2.5：控制流 MVP

```txt
- Show
- For
- mountShow
- mountFor
- mountDynamic 全量替换
```

---

## Phase 2.6：render 生命周期

```txt
- render() 创建 scope
- dispose() 停止 scope
- dispose() 清空 container
```

---

## Phase 2.7：测试补齐

```txt
- template.spec.ts
- insert.spec.ts
- bindings.spec.ts
- events.spec.ts
- refs.spec.ts
- render.spec.ts
- controlFlow.spec.ts
```

---

# 16. Phase 2 完成标准

Phase 2 完成后，下面这些能力要稳定：

```txt
1. template() 能克隆静态 DOM
2. insert() 能插入文本、节点、数组
3. bindText() 能响应 state(primitive).value 和 state(object).prop
4. bindAttr() 能更新/删除属性
5. bindProp() 能更新 DOM property
6. bindClass() 支持 string/object/array
7. bindStyle() 支持 string/object
8. bindEvent() 自动清理事件
9. bindRef() 支持 JSX ref 协议
10. render() 能挂载和销毁 scope
11. mountShow() 能响应条件变化
12. mountFor() 能响应数组变化，MVP 允许全量替换
```

---

# 17. 最终效果

Phase 2 完成后，Zeus 已经具备一个最小可运行 runtime：

```tsx
const count = state(0)
const user = state({ name: 'Zeus' })
const input = state<HTMLInputElement | null>(null)

function App() {
  return (
    <div>
      <input
        ref={input}
        value={user.name}
        onInput={e => {
          user.name = e.currentTarget.value
        }}
      />

      <button onClick={() => count.value++}>
        {user.name}: {count.value}
      </button>
    </div>
  )
}
```

compiler 只需要生成 runtime helper 调用，runtime-dom 就可以完成实际 DOM 更新。
这一步做完，Phase 3 才能专心做 compiler MVP 闭环。
