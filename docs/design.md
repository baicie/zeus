下面这版直接按“**可以开仓库开始做**”的粒度来写。

---

# Zeus monorepo 目录结构

先不要一上来拆太散，但也别全部塞一个包。比较稳的组织方式：

```txt
zeus/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ turbo.json
├─ playground/
│  ├─ basic/
│  └─ web-components/
├─ packages/
│  ├─ zeus/
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ jsx-runtime.ts
│  │  │  ├─ control-flow.ts
│  │  │  └─ web-components.ts
│  │  └─ package.json
│  │
│  ├─ core/
│  │  ├─ src/
│  │  │  ├─ signal.ts
│  │  │  ├─ memo.ts
│  │  │  ├─ effect.ts
│  │  │  ├─ root.ts
│  │  │  ├─ cleanup.ts
│  │  │  ├─ batch.ts
│  │  │  ├─ owner.ts
│  │  │  └─ index.ts
│  │  └─ package.json
│  │
│  ├─ runtime-dom/
│  │  ├─ src/
│  │  │  ├─ template.ts
│  │  │  ├─ mount.ts
│  │  │  ├─ insert.ts
│  │  │  ├─ text.ts
│  │  │  ├─ attr.ts
│  │  │  ├─ class.ts
│  │  │  ├─ style.ts
│  │  │  ├─ event.ts
│  │  │  ├─ list.ts
│  │  │  ├─ condition.ts
│  │  │  ├─ fragment.ts
│  │  │  ├─ ref.ts
│  │  │  ├─ dispose.ts
│  │  │  └─ index.ts
│  │  └─ package.json
│  │
│  ├─ runtime-wc/
│  │  ├─ src/
│  │  │  ├─ define-element.ts
│  │  │  ├─ host.ts
│  │  │  ├─ slot.ts
│  │  │  ├─ attr-prop.ts
│  │  │  ├─ light-dom-projection.ts
│  │  │  └─ index.ts
│  │  └─ package.json
│  │
│  ├─ compiler-shared/
│  │  ├─ src/
│  │  │  ├─ ir.ts
│  │  │  ├─ jsx.ts
│  │  │  ├─ symbols.ts
│  │  │  ├─ naming.ts
│  │  │  ├─ diagnostics.ts
│  │  │  └─ index.ts
│  │  └─ package.json
│  │
│  ├─ compiler-babel/
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ plugin.ts
│  │  │  ├─ component-analyzer.ts
│  │  │  ├─ jsx-to-ir.ts
│  │  │  ├─ ir-optimize.ts
│  │  │  ├─ ir-to-js.ts
│  │  │  ├─ transforms/
│  │  │  │  ├─ dom-element.ts
│  │  │  │  ├─ component.ts
│  │  │  │  ├─ show.ts
│  │  │  │  ├─ for.ts
│  │  │  │  ├─ host.ts
│  │  │  │  └─ slot.ts
│  │  │  └─ dev-warnings.ts
│  │  └─ package.json
│  │
│  ├─ vite-plugin/
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ hmr.ts
│  │  │  └─ env.ts
│  │  └─ package.json
│  │
│  ├─ types/
│  │  ├─ src/
│  │  │  ├─ jsx.d.ts
│  │  │  └─ index.d.ts
│  │  └─ package.json
│  │
│  └─ devtools-protocol/
│     ├─ src/
│     │  ├─ inspector.ts
│     │  └─ index.ts
│     └─ package.json
└─ examples/
   ├─ counter
   ├─ todo
   └─ wc-card
```

---

# 每个包的职责

## `packages/zeus`

对外统一入口。

导出：

- `createSignal`
- `createMemo`
- `createEffect`
- `batch`
- `onCleanup`
- `Show`
- `For`
- `render`
- `defineElement`
- `Host`
- `Slot`

这个包本身尽量薄，只负责 re-export，不承载核心逻辑。

---

## `packages/core`

纯响应式层。

目标：

- 只处理依赖追踪、effect 执行、owner/scope、cleanup
- 不依赖 DOM
- 只在内部适配 alien-signal

这样未来：

- SSR 可以复用
- runtime-dom/runtime-wc 都能复用
- 未来替换 signal 内核也不影响上层 API

---

## `packages/runtime-dom`

纯 DOM helper。

职责非常克制：

- template clone
- text/attr/class/style/event patch
- anchor 区域管理
- list reconcile
- 挂载、卸载、清理

---

## `packages/runtime-wc`

Web Components 专属运行时桥接。

职责：

- `defineElement`
- host/shadow root 初始化
- attributes <-> props 反射
- slot 运行时
- light DOM projection

---

## `packages/compiler-shared`

编译器公用模型层。

必须有的东西：

- Zeus IR
- 内置节点标识
- 诊断类型
- helper 名称表
- 命名/作用域工具

这层是你以后从 Babel 换到 Rust 的护城河。

---

## `packages/compiler-babel`

第一版编译器。

流水线：

1. 识别组件
2. JSX -> IR
3. IR 优化
4. IR -> JS helper 调用

---

## `packages/vite-plugin`

把 Babel 编译器接进 Vite。

职责：

- 处理 `.tsx/.jsx`
- 注入 jsx-runtime
- HMR
- dev mode 标记

---

# Zeus 的核心公开类型

---

## 响应式 API 类型

```ts
export type Accessor<T> = () => T
export type Setter<T> = (value: T | ((prev: T) => T)) => T

export interface Signal<T> {
  get: Accessor<T>
  set: Setter<T>
}

export type CleanupFn = () => void

export interface Owner {
  parent: Owner | null
  cleanups: CleanupFn[] | null
  children: Owner[] | null
  disposed: boolean
}

export interface Computation<T = unknown> {
  owner: Owner | null
  fn: () => T
  value?: T
  stale: boolean
  deps: Set<SignalNode<any>> | null
}

export interface SignalNode<T> {
  value: T
  observers: Set<Computation>
}
```

对外导出 API：

```ts
export declare function createSignal<T>(initial: T): [Accessor<T>, Setter<T>]
export declare function createMemo<T>(fn: () => T): Accessor<T>
export declare function createEffect(fn: () => void): void
export declare function createRoot<T>(fn: (dispose: () => void) => T): T
export declare function onCleanup(fn: CleanupFn): void
export declare function batch<T>(fn: () => T): T
```

---

## JSX 类型

MVP 不要做太复杂，先以 DOM 为中心：

```ts
declare global {
  namespace JSX {
    type Element = Node

    interface ElementChildrenAttribute {
      children: {}
    }

    interface IntrinsicElements {
      [elemName: string]: any
    }
  }
}
```

后续再细化 DOM attrs typings。

---

# Core 层最小实现抽象

你底层用 alien-signal，但 Zeus 不应该把 alien-signal 暴露出来。
推荐在 `core` 里包一层 facade。

---

## `signal.ts`

```ts
import { createInternalSignal } from './vendor-alien'
import { trackRead, triggerWrite } from './graph'

export function createSignal<T>(
  initial: T,
): [() => T, (v: T | ((p: T) => T)) => T] {
  const node = createInternalSignal(initial)

  const get = () => {
    trackRead(node)
    return node.value
  }

  const set = (next: T | ((prev: T) => T)) => {
    const value =
      typeof next === 'function' ? (next as (p: T) => T)(node.value) : next

    if (Object.is(value, node.value)) return node.value
    node.value = value
    triggerWrite(node)
    return node.value
  }

  return [get, set]
}
```

---

## `owner.ts`

```ts
let CurrentOwner: Owner | null = null

export function getOwner() {
  return CurrentOwner
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prev = CurrentOwner
  CurrentOwner = owner
  try {
    return fn()
  } finally {
    CurrentOwner = prev
  }
}

export function createOwner(parent: Owner | null): Owner {
  const owner: Owner = {
    parent,
    cleanups: [],
    children: [],
    disposed: false,
  }
  if (parent) parent.children!.push(owner)
  return owner
}
```

---

## `root.ts`

```ts
import { createOwner, runWithOwner, getOwner } from './owner'
import { disposeOwner } from './cleanup'

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const owner = createOwner(getOwner())
  return runWithOwner(owner, () => fn(() => disposeOwner(owner)))
}
```

---

## `cleanup.ts`

```ts
export function onCleanup(fn: () => void) {
  const owner = getOwner()
  if (!owner) throw new Error('onCleanup must be called under an owner')
  owner.cleanups!.push(fn)
}

export function disposeOwner(owner: Owner) {
  if (owner.disposed) return
  owner.disposed = true

  for (const child of owner.children || []) disposeOwner(child)
  for (const cleanup of owner.cleanups || []) cleanup()

  owner.children = []
  owner.cleanups = []
}
```

---

# runtime-dom 的关键 helper 设计

这里是 Zeus 的执行面。核心原则：

- helper 少而稳
- 语义明确
- 编译器很容易拼装

---

## 1) 模板创建

```ts
const templateCache = new Map<string, HTMLTemplateElement>()

export function createTemplate(html: string): () => Node {
  let tpl = templateCache.get(html)
  if (!tpl) {
    tpl = document.createElement('template')
    tpl.innerHTML = html
    templateCache.set(html, tpl)
  }
  return () => tpl!.content.firstChild!.cloneNode(true)
}
```

复杂点的模板返回 `DocumentFragment` 或固定根节点数组。

---

## 2) 文本绑定

```ts
import { createEffect } from '@zeus/core'

export function bindText(node: Text, expr: () => unknown) {
  createEffect(() => {
    const v = expr()
    node.data = v == null ? '' : String(v)
  })
}
```

---

## 3) 属性绑定

```ts
export function bindAttr(el: Element, name: string, expr: () => unknown) {
  createEffect(() => {
    const v = expr()
    if (v == null || v === false) {
      el.removeAttribute(name)
    } else {
      el.setAttribute(name, String(v))
    }
  })
}
```

---

## 4) DOM property 绑定

```ts
export function bindProp<T extends Element, K extends keyof T>(
  el: T,
  key: K,
  expr: () => T[K],
) {
  createEffect(() => {
    ;(el[key] as any) = expr()
  })
}
```

---

## 5) class/style patch

```ts
export function bindClassName(el: HTMLElement, expr: () => string) {
  createEffect(() => {
    el.className = expr() || ''
  })
}

export function bindStyleObject(
  el: HTMLElement,
  expr: () => Record<string, string | null>,
) {
  let prev: Record<string, string | null> = {}
  createEffect(() => {
    const next = expr() || {}
    for (const k in prev) {
      if (!(k in next) || next[k] == null) el.style.removeProperty(k)
    }
    for (const k in next) {
      const v = next[k]
      if (v != null) el.style.setProperty(k, v)
    }
    prev = next
  })
}
```

---

## 6) 事件

MVP 先别上代理，直接绑。

```ts
export function bindEvent(
  el: Element,
  name: string,
  handler: EventListenerOrEventListenerObject,
) {
  el.addEventListener(name, handler)
  return () => el.removeEventListener(name, handler)
}
```

编译器生成时配合 `onCleanup` 自动清理。

---

## 7) 区域锚点

Show / For / Fragment 都会用到。

```ts
export interface Region {
  start: Comment
  end: Comment
}

export function createRegion(): Region {
  return {
    start: document.createComment(''),
    end: document.createComment(''),
  }
}

export function clearRegion(region: Region) {
  let node = region.start.nextSibling
  while (node && node !== region.end) {
    const next = node.nextSibling
    node.parentNode?.removeChild(node)
    node = next
  }
}

export function insertBeforeEnd(region: Region, node: Node) {
  region.end.parentNode!.insertBefore(node, region.end)
}
```

---

## 8) render

```ts
import { createRoot } from '@zeus/core'

export function render(fn: () => Node, container: Element) {
  return createRoot(dispose => {
    const node = fn()
    container.appendChild(node)
    return dispose
  })
}
```

---

# 控制流组件的真实策略

MVP 用编译期内置组件，不要真的把 `Show`、`For` 当普通组件跑 JSX。

也就是说：

```tsx
<Show when={ok()}>
  <div>...</div>
</Show>
```

不是运行时 React 风格组件，而是 **编译器识别特殊节点**。

---

## Show 的运行时 helper

```ts
export function mountCondition(
  markerStart: Comment,
  markerEnd: Comment,
  when: () => unknown,
  factory: () => Node,
) {
  let mounted = false
  let current: Node | null = null

  createEffect(() => {
    const visible = !!when()

    if (visible && !mounted) {
      current = factory()
      markerEnd.parentNode!.insertBefore(current, markerEnd)
      mounted = true
      return
    }

    if (!visible && mounted) {
      current?.parentNode?.removeChild(current)
      current = null
      mounted = false
    }
  })
}
```

后续增强成：

- subtree owner
- fallback
- fragment children

---

## For 的运行时 helper

MVP 版本：

```ts
export function mountList<T>(
  markerStart: Comment,
  markerEnd: Comment,
  list: () => readonly T[],
  renderItem: (item: T, index: () => number) => Node,
  getKey?: (item: T) => string | number,
) {
  let prevNodes: Node[] = []

  createEffect(() => {
    const items = list()

    for (const n of prevNodes) n.parentNode?.removeChild(n)
    prevNodes = items.map((item, i) => renderItem(item, () => i))

    for (const n of prevNodes) {
      markerEnd.parentNode!.insertBefore(n, markerEnd)
    }
  })
}
```

这是最小版，只保证正确。

下一步再升级成 keyed reconcile：

- old keyed map
- longest stable subsequence
- 节点复用
- 子 scope dispose

---

# Zeus IR 设计

这是最重要的一层。
不要直接从 JSX AST 一把梭输出 helper 调用。先建 IR。

---

## IR 顶层

```ts
export interface TemplateIR {
  kind: 'template'
  name: string
  html: string
  roots: number
  bindings: BindingIR[]
}

export type BindingIR =
  | TextBindingIR
  | AttrBindingIR
  | PropBindingIR
  | EventBindingIR
  | RefBindingIR
  | ShowBindingIR
  | ForBindingIR
  | ComponentBindingIR
  | SlotBindingIR
  | HostBindingIR
```

---

## 节点定位

建议每个绑定都用 path 定位节点：

```ts
export type NodePath = number[]
```

例如：

- `[0]` 根节点
- `[0, 1]` 根节点的第二个子节点
- `[0, 1, 0]` 更深一级

这样实现简单，虽然不是最终最优。

后续性能优化可改成 compile-time hole index。

---

## 绑定类型

```ts
export interface TextBindingIR {
  type: 'text'
  path: NodePath
  expr: ExprIR
}

export interface AttrBindingIR {
  type: 'attr'
  path: NodePath
  name: string
  expr: ExprIR
}

export interface PropBindingIR {
  type: 'prop'
  path: NodePath
  name: string
  expr: ExprIR
}

export interface EventBindingIR {
  type: 'event'
  path: NodePath
  name: string
  handler: ExprIR
}

export interface RefBindingIR {
  type: 'ref'
  path: NodePath
  expr: ExprIR
}

export interface ShowBindingIR {
  type: 'show'
  path: NodePath
  when: ExprIR
  body: TemplateIR | ComponentBlockIR
  fallback?: TemplateIR | ComponentBlockIR
}

export interface ForBindingIR {
  type: 'for'
  path: NodePath
  each: ExprIR
  itemName: string
  indexName?: string
  body: TemplateIR | ComponentBlockIR
  keyBy?: ExprIR
}

export interface ComponentBindingIR {
  type: 'component'
  path: NodePath
  component: ExprIR
  props: Record<string, ExprIR>
  children?: Array<TemplateIR | ComponentBlockIR>
}

export interface HostBindingIR {
  type: 'host'
  shadow: boolean | 'open' | 'closed'
  delegatesFocus?: boolean
}

export interface SlotBindingIR {
  type: 'slot'
  path: NodePath
  name?: string
}
```

---

## 表达式 IR

MVP 不需要造完整 JS IR，直接存 Babel AST 节点引用也行。

```ts
export interface ExprIR {
  kind: 'js'
  node: any // Babel Expression
  reactiveHint?: 'static' | 'dynamic' | 'unknown'
}
```

第一版这么做够了。
等 Rust 化时，再换成框架自己的表达式 IR。

---

# JSX 到 IR 的规则

---

## 1) 原生元素

输入：

```tsx
<button class="btn">{count()}</button>
```

输出大概：

```ts
{
  kind: "template",
  name: "_tmpl$1",
  html: `<button class="btn"><!></button>`,
  roots: 1,
  bindings: [
    {
      type: "text",
      path: [0, 0],
      expr: { kind: "js", node: countCall }
    }
  ]
}
```

这里 `<!>` 是内部文本洞占位，最终 codegen 会按路径找到对应 Text 节点。

更稳的方式是直接插 comment/text placeholder：

```html
<button class="btn"><!--z--></button>
```

生成时替换为 `Text` 节点更简单。

---

## 2) 事件

```tsx
<button onClick={inc} />
```

变成：

```ts
{
  type: "event",
  path: [0],
  name: "click",
  handler: { kind: "js", node: incExpr }
}
```

---

## 3) 动态属性

```tsx
<input value={name()} disabled={loading()} />
```

规则：

- DOM property 优先的走 `prop`
- 普通 attribute 走 `attr`

例如 `value`, `checked`, `selected` 建议编译为 prop。

---

## 4) Show

```tsx
<Show when={visible()}>
  <span>ok</span>
</Show>
```

不要当组件，直接走特殊 binding。

---

## 5) For

```tsx
<For each={items()}>{(item, i) => <li>{item.name}</li>}</For>
```

编译器提取：

- each expression
- item/index 形参
- body JSX

生成 `ForBindingIR`

---

## 6) Host / Slot

```tsx
<Host shadow={false}>
  <header>
    <Slot name="header" />
  </header>
  <main>
    <Slot />
  </main>
</Host>
```

Host 不能当普通 element。
它是组件根元信息节点。

规则：

- `Host` 只能出现在 `defineElement` 根返回层
- `Slot` 只能出现在 `Host` 子树中
- shadow mode 下生成原生 `<slot>`
- light mode 下生成 Zeus 投影 marker

---

# Babel 编译器最小实现骨架

下面是第一版比较合理的组织方式。

---

## `plugin.ts`

```ts
import { declare } from '@babel/helper-plugin-utils'
import type { PluginObj } from '@babel/core'
import { analyzeComponent } from './component-analyzer'
import { transformComponent } from './jsx-to-ir'
import { generateComponentCode } from './ir-to-js'

export default declare((api): PluginObj => {
  api.assertVersion(7)

  return {
    name: 'zeus-compiler-babel',
    visitor: {
      Program(path, state) {
        let changed = false

        path.traverse({
          FunctionDeclaration(fnPath) {
            if (!analyzeComponent(fnPath)) return

            const ir = transformComponent(fnPath, state)
            const next = generateComponentCode(fnPath, ir, state)
            fnPath.replaceWith(next)
            changed = true
          },

          VariableDeclarator(varPath) {
            const init = varPath.get('init')
            if (
              !init.isArrowFunctionExpression() &&
              !init.isFunctionExpression()
            )
              return
            if (!analyzeComponent(init as any)) return

            const ir = transformComponent(init as any, state)
            const next = generateComponentCode(init as any, ir, state)

            init.replaceWith(next as any)
            changed = true
          },
        })

        if (changed) {
          // 注入 runtime imports
        }
      },
    },
  }
})
```

---

## `component-analyzer.ts`

先用保守识别，不要太聪明。

```ts
export function analyzeComponent(fnPath: any): boolean {
  const parentId = fnPath.parentPath?.node?.id || fnPath.node.id
  const name = parentId?.name
  if (!name) return false
  if (!/^[A-Z]/.test(name)) return false

  let hasJSXReturn = false

  fnPath.traverse({
    ReturnStatement(retPath: any) {
      const arg = retPath.get('argument')
      if (arg.isJSXElement() || arg.isJSXFragment()) {
        hasJSXReturn = true
        retPath.stop()
      }
    },
  })

  return hasJSXReturn
}
```

---

## `jsx-to-ir.ts`

这个文件做三件事：

1. 找到 return JSX
2. 递归转换 JSX subtree
3. 产出 `TemplateIR`

骨架：

```ts
export function transformComponent(fnPath: any, state: any): TemplateIR {
  let rootJSX: any = null

  fnPath.traverse({
    ReturnStatement(retPath: any) {
      const arg = retPath.get('argument')
      if (arg.isJSXElement() || arg.isJSXFragment()) {
        rootJSX = arg
        retPath.stop()
      }
    },
  })

  if (!rootJSX) throw new Error('No JSX root found')

  return lowerJSXNodeToTemplateIR(rootJSX, state)
}
```

---

## `lowerJSXNodeToTemplateIR`

简化思路：

- 维护一个 html buffer
- 遇到静态节点写入 html
- 遇到动态点生成 binding
- 维护当前 path

伪代码：

```ts
function lowerJSXNodeToTemplateIR(nodePath, state): TemplateIR {
  const ctx = {
    html: '',
    bindings: [],
    templateName: state.generateUidIdentifier('tmpl').name,
  }

  visitJSX(nodePath, ctx, [0])

  return {
    kind: 'template',
    name: ctx.templateName,
    html: ctx.html,
    roots: 1,
    bindings: ctx.bindings,
  }
}
```

---

## DOM element transform 规则

```ts
function visitElement(path, ctx, nodePath) {
  const tag = getTagName(path)

  if (tag === 'Show') return visitShow(path, ctx, nodePath)
  if (tag === 'For') return visitFor(path, ctx, nodePath)
  if (tag === 'Host') return visitHost(path, ctx, nodePath)
  if (tag === 'Slot') return visitSlot(path, ctx, nodePath)
  if (isComponentTag(tag)) return visitComponent(path, ctx, nodePath)

  ctx.html += `<${tag}`

  for (const attr of getAttributes(path)) {
    if (isStaticAttr(attr)) {
      ctx.html += ` ${attr.name}="${escapeHtml(attr.value)}"`
    } else if (isEventAttr(attr)) {
      ctx.bindings.push({
        type: 'event',
        path: [...nodePath],
        name: normalizeEventName(attr.name),
        handler: toExprIR(attr.expr),
      })
    } else if (isPropAttr(tag, attr.name)) {
      ctx.bindings.push({
        type: 'prop',
        path: [...nodePath],
        name: attr.name,
        expr: toExprIR(attr.expr),
      })
    } else {
      ctx.bindings.push({
        type: 'attr',
        path: [...nodePath],
        name: attr.name,
        expr: toExprIR(attr.expr),
      })
    }
  }

  ctx.html += `>`

  visitChildren(path, ctx, nodePath)

  ctx.html += `</${tag}>`
}
```

---

## 文本洞处理

例如：

```tsx
<div>Hello {name()}</div>
```

在 `visitChildren` 里：

- 静态文本直接进 html
- 表达式文本插入占位 comment/text
- 记录 binding

```ts
function visitExprContainer(path, ctx, childPath) {
  ctx.html += `<!--z-t-->`

  ctx.bindings.push({
    type: 'text',
    path: [...childPath],
    expr: toExprIR(path.get('expression').node),
  })
}
```

后面 codegen 时要能根据 path 找到这个 placeholder 的对应节点。

---

# IR -> JS codegen 设计

这是第二个关键点。
不要一开始追求最短输出，先追求结构稳定。

---

## 编译前源码

```tsx
function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <button class="btn" onClick={() => setCount(count() + 1)}>
      count: {count()}
    </button>
  )
}
```

---

## 建议生成代码

```ts
import {
  createTemplate,
  getNode,
  createTextPlaceholder,
  bindText,
  bindEvent,
} from '@zeus/runtime-dom'

const _tmpl$1 = createTemplate(`<button class="btn">count: <!--z-t--></button>`)

function Counter() {
  const [count, setCount] = createSignal(0)

  const _root = _tmpl$1()
  const _el$1 = _root
  const _text$1 = getNode(_root, [0, 1]) as Comment
  const _textNode$1 = createTextPlaceholder(_text$1)

  bindEvent(_el$1, 'click', () => setCount(count() + 1))
  bindText(_textNode$1, () => count())

  return _root
}
```

---

## 为什么建议 `getNode + placeholder replace`

因为第一版很好实现。

你模板中放 comment：

```html
<!--z-t-->
```

运行时找到 comment 后替换成真实 `Text` 节点：

```ts
export function createTextPlaceholder(anchor: Comment): Text {
  const text = document.createTextNode('')
  anchor.parentNode!.replaceChild(text, anchor)
  return text
}
```

这样绑定逻辑很干净。

---

## `getNode`

```ts
export function getNode(root: Node, path: number[]): Node {
  let current: Node = root
  for (const i of path) {
    current = current.childNodes[i]
  }
  return current
}
```

第一版够用。
后续可替换成预计算 hole 索引。

---

# Web Components 的最小实现草图

---

## 用户写法

```tsx
import { defineElement, Host, Slot, createSignal } from 'zeus'

export default defineElement(
  'z-counter',
  {
    shadow: false,
    props: {
      count: Number,
      title: String,
      open: Boolean,
    },
  },
  props => {
    const [local, setLocal] = createSignal(props.count ?? 0)

    return (
      <Host>
        <header>
          <Slot name="header" />
        </header>

        <button onClick={() => setLocal(v => v + 1)}>{local()}</button>

        <main>
          <Slot />
        </main>
      </Host>
    )
  },
)
```

---

## `define-element.ts`

```ts
export interface ElementOptions {
  shadow?: boolean | 'open' | 'closed'
  delegatesFocus?: boolean
  props?: Record<
    string,
    StringConstructor | NumberConstructor | BooleanConstructor
  >
}

export function defineElement(
  tag: string,
  options: ElementOptions,
  setup: (props: any, host: HTMLElement) => Node,
) {
  const observed = Object.keys(options.props || {}).map(toKebabCase)

  class ZeusElement extends HTMLElement {
    static get observedAttributes() {
      return observed
    }

    private _dispose?: () => void
    private _props: Record<string, any> = {}
    private _mountRoot!: HTMLElement | ShadowRoot

    constructor() {
      super()
      initProps(this._props, this, options.props || {})
    }

    connectedCallback() {
      if (this._dispose) return

      this._mountRoot =
        options.shadow && options.shadow !== false
          ? this.attachShadow({
              mode: options.shadow === 'closed' ? 'closed' : 'open',
              delegatesFocus: !!options.delegatesFocus,
            })
          : this

      this._dispose = createRoot(dispose => {
        syncInitialAttributes(this._props, this, options.props || {})
        const tree = setup(this._props, this)
        this._mountRoot.appendChild(tree)

        if (options.shadow === false) {
          setupLightDomProjection(this)
        }

        onCleanup(() => cleanupProjection(this))
        return dispose
      })
    }

    disconnectedCallback() {
      this._dispose?.()
      this._dispose = undefined
    }

    attributeChangedCallback(
      name: string,
      _prev: string | null,
      next: string | null,
    ) {
      const propName = toCamelCase(name)
      this._props[propName] = coerceValue(next, options.props?.[propName])
    }
  }

  customElements.define(tag, ZeusElement)
  return ZeusElement
}
```

---

## props 反射策略

```ts
function coerceValue(
  raw: string | null,
  type?: StringConstructor | NumberConstructor | BooleanConstructor,
) {
  if (type === Boolean) return raw !== null
  if (type === Number) return raw == null ? undefined : Number(raw)
  if (type === String) return raw ?? undefined
  return raw
}
```

后续要升级成 signal 化：

- `_props.title` 最好不是 plain value
- 而是 getter or internal signal-backed property

更合理做法：

```ts
_propsSignals[propName] = createSignal(initial)
```

然后给 `props.title` 暴露 getter：

```ts
Object.defineProperty(publicProps, 'title', {
  get() {
    return titleSignal[0]()
  },
  set(v) {
    titleSignal[1](v)
  },
})
```

这样 setup 内部访问 `props.title` 是响应式的。

---

# Light DOM Slot 的正确落地方式

这部分很关键。

---

## Shadow DOM 模式

`<Slot name="header" />` 编译成原生 `<slot name="header"></slot>`。
完全交给浏览器。

---

## Light DOM 模式

原生 slot 不工作，所以 Zeus 自己投影。

### 编译策略

`Slot` 节点不输出 `<slot>`，输出占位：

```html
<!--slot:header-->
```

或者一个空的标记节点：

```html
<span hidden data-zeus-slot="header"></span>
```

更推荐 comment marker。

---

## 运行时策略

1. `connectedCallback` 时读取 host 初始 children
2. 根据 `slot` 属性分组
3. 找到组件模板里每个 `slot marker`
4. 把对应外部节点移动到 marker 位置
5. 用 `MutationObserver` 监听 host childList 变化
6. 重新投影

---

## 数据结构

```ts
interface ProjectionRecord {
  host: HTMLElement
  observer: MutationObserver
  slots: Map<string, Comment>
  sourceNodes: Node[]
}
```

---

## 最小投影实现

```ts
export function setupLightDomProjection(host: HTMLElement) {
  const slotMarkers = collectSlotMarkers(host)
  const lightChildren = Array.from(host.childNodes).filter(
    n => !isFrameworkNode(n),
  )

  projectNodes(host, slotMarkers, lightChildren)

  const observer = new MutationObserver(() => {
    const nodes = Array.from(host.childNodes).filter(n => !isFrameworkNode(n))
    projectNodes(host, slotMarkers, nodes)
  })

  observer.observe(host, { childList: true })
  ;(host as any).__zeusProjection = { observer }
}
```

注意这里真实实现要避免“自己投影移动节点又触发 observer 死循环”，所以需要：

- ignore 标记
- 暂停 observer
- 或只观察外层 source 区域

更稳的方式是：

- 初始时先把用户 children 缓存到 `DocumentFragment`
- 然后分发进 slot
- 记录哪些节点是 projected nodes

---

# 编译器的 helper 注入策略

Babel 生成代码时需要自动引入 helper。

建议维护一个 helper registry：

```ts
export const HELPERS = {
  createTemplate: ['@zeus/runtime-dom', 'createTemplate'],
  getNode: ['@zeus/runtime-dom', 'getNode'],
  bindText: ['@zeus/runtime-dom', 'bindText'],
  bindAttr: ['@zeus/runtime-dom', 'bindAttr'],
  bindProp: ['@zeus/runtime-dom', 'bindProp'],
  bindEvent: ['@zeus/runtime-dom', 'bindEvent'],
  mountCondition: ['@zeus/runtime-dom', 'mountCondition'],
  mountList: ['@zeus/runtime-dom', 'mountList'],
} as const
```

codegen 时按需收集，最后统一插 import。

这样未来换 runtime 路径时很容易。

---

# 一个完整编译例子

---

## 输入

```tsx
function App() {
  const [count, setCount] = createSignal(0)

  return (
    <div class="app">
      <button onClick={() => setCount(count() + 1)}>{count()}</button>

      <Show when={count() > 3}>
        <p>big</p>
      </Show>
    </div>
  )
}
```

---

## 中间 IR（简化）

```ts
{
  kind: "template",
  name: "_tmpl$1",
  html: `<div class="app"><button><!--z-t--></button><!--z-show--></div>`,
  roots: 1,
  bindings: [
    {
      type: "event",
      path: [0, 0],
      name: "click",
      handler: "() => setCount(count() + 1)"
    },
    {
      type: "text",
      path: [0, 0, 0],
      expr: "count()"
    },
    {
      type: "show",
      path: [0, 1],
      when: "count() > 3",
      body: {
        kind: "template",
        name: "_tmpl$2",
        html: `<p>big</p>`,
        roots: 1,
        bindings: []
      }
    }
  ]
}
```

---

## 输出 JS（简化）

```ts
const _tmpl$1 = createTemplate(
  `<div class="app"><button><!--z-t--></button><!--z-show--></div>`,
)
const _tmpl$2 = createTemplate(`<p>big</p>`)

function App() {
  const [count, setCount] = createSignal(0)

  const _root = _tmpl$1()
  const _btn = getNode(_root, [0]) as HTMLButtonElement
  const _textAnchor = getNode(_root, [0, 0]) as Comment
  const _text = createTextPlaceholder(_textAnchor)
  const _showAnchor = getNode(_root, [1]) as Comment
  const _showEnd = insertEndMarkerAfter(_showAnchor)

  bindEvent(_btn, 'click', () => setCount(count() + 1))
  bindText(_text, () => count())

  mountCondition(
    _showAnchor,
    _showEnd,
    () => count() > 3,
    () => _tmpl$2(),
  )

  return _root
}
```

这已经是一个“真能运行”的框架雏形了。

---

# Dev warning 建议第一版就上

这些 warning 非常值钱。

---

## 1) props 解构警告

```tsx
function Comp(props) {
  const { title } = props
  return <div>{title}</div>
}
```

如果 `props.title` 想保持响应式，这种写法很危险。
第一版直接 warning：

- `Reactive props destructuring is not supported in Zeus MVP`

---

## 2) Host 位置非法

```tsx
<div>
  <Host>...</Host>
</div>
```

直接报错。
Host 必须是 `defineElement` 返回树的根宿主语义。

---

## 3) Slot 出现在普通组件中

直接报错。

---

## 4) For 没有稳定 key

可以 warning，不强制报错。

---

## 5) JSX 表达式里直接返回数组

MVP 先别支持太随意的 children flatten，warning 更稳。

---

# 第一阶段的最小任务拆解

---

## 第 1 周：core + runtime-dom 最小闭环

目标：

- `createSignal`
- `createEffect`
- `createRoot`
- `onCleanup`
- `createTemplate`
- `bindText`
- `bindAttr`
- `bindEvent`
- `render`

成功标准：

- 手写 runtime helper，不靠编译器，也能写一个小 demo

---

## 第 2 周：Babel JSX 编译最小闭环

目标：

- 把简单元素编译成 template + bind
- 支持静态标签、文本插值、事件、动态属性

成功标准：

- Counter demo 编译后可运行
- 组件不 rerender

---

## 第 3 周：Show / Fragment

目标：

- comment anchor
- 条件区域挂载/卸载
- 子树 cleanup

---

## 第 4 周：For

目标：

- 先做正确版
- 再做 keyed 优化版

---

## 第 5 周：Vite 插件 + playground

目标：

- `.tsx` 可直接跑
- 支持 source map
- 基础 HMR

---

## 第 6 周：Web Components Shadow 模式

目标：

- `defineElement`
- `Host`
- `Slot`
- attr/property 反射
- cleanup

---

## 第 7 周：Light DOM slot 投影

目标：

- named/default slot
- observer
- projection 更新

---

# 第一版先别做的几件事

这几件事最容易拖死项目：

## 1) 编译期 signal 语法糖

比如 `$signal`、自动追踪赋值之类。
很诱人，但晚点做。

## 2) SSR

先把 CSR 编译模型做稳。

## 3) 全功能 store

signal 先够用。

## 4) router/resource/suspense

先别做生态全家桶。

## 5) Rust 编译器

先把 IR 和语义跑稳。

---

# 我建议你现在立的三个技术 RFC

先写文档，能少返工很多。

---

## RFC-001：组件执行与更新模型

明确：

- 组件只初始化一次
- 状态更新不触发组件 rerun
- DOM 节点更新由绑定 effect 驱动

---

## RFC-002：Zeus JSX 编译规范

明确：

- 哪些 JSX 是静态
- 哪些会生成 binding
- Show/For/Host/Slot 是内置语义节点
- props/reactivity 的边界

---

## RFC-003：Web Components 语义

明确：

- `defineElement` 约束
- Host/Slot 编译语义
- shadow vs light DOM 的差异
- light DOM slot 不是原生 slot

---

# 一份很适合现在就写出来的 package API 草图

---

## `packages/zeus/src/index.ts`

```ts
export {
  createSignal,
  createMemo,
  createEffect,
  createRoot,
  onCleanup,
  batch,
} from '@zeus/core'

export { render } from '@zeus/runtime-dom'

export { Show, For } from './control-flow'
export { defineElement, Host, Slot } from './web-components'
```

---

## `packages/zeus/src/control-flow.ts`

```ts
export function Show(_: any): never {
  throw new Error(
    'Show is a compile-time built-in and should not run directly.',
  )
}

export function For(_: any): never {
  throw new Error('For is a compile-time built-in and should not run directly.')
}
```

---

## `packages/zeus/src/web-components.ts`

```ts
export { defineElement } from '@zeus/runtime-wc'

export function Host(_: any): never {
  throw new Error(
    'Host is a compile-time built-in and should not run directly.',
  )
}

export function Slot(_: any): never {
  throw new Error(
    'Slot is a compile-time built-in and should not run directly.',
  )
}
```

这种设计很好，因为：

- 用户有显式 API
- 编译器可以识别内置节点
- 未编译时错误也很明确

---

# 你下一步最值得直接开写的 5 个文件

按投入产出比排序：

1. `packages/core/src/createSignal.ts`
2. `packages/runtime-dom/src/template.ts`
3. `packages/runtime-dom/src/text.ts`
4. `packages/compiler-shared/src/ir.ts`
5. `packages/compiler-babel/src/jsx-to-ir.ts`

因为这 5 个一出来，Zeus 的骨架就定了。

---

# 最后给你一个很务实的判断

如果你想把 Zeus 做成“专业框架”，不是玩具，那最重要的不是先追求特性数量，而是尽快把这条链打通：

**TSX -> Babel -> Zeus IR -> runtime-dom helper -> 精确 DOM 更新**

然后再把：

**defineElement + Host + Slot + light DOM projection**

做成 Zeus 的差异化王牌。

这两条一旦打通，框架就成立了。

下一条最合适直接进入：

**`ir.ts`、`runtime-dom` helper、以及 Babel 插件入口的具体代码模板**。
