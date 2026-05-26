下面给你 **Phase 6：性能优化、调度系统、列表 diff、事件委托与 Benchmark** 的详细设计与代码草案。

前面 Phase 0~5 已经解决：

```txt id="vx1atu"
Phase 0：项目基线
Phase 1：state() 统一状态 API
Phase 2：runtime-dom MVP
Phase 3：compiler JSX 闭环
Phase 4：框架入口 + Vite 插件
Phase 5：Host / Slot / Web Components
```

Phase 6 不再主要扩语法，而是让 Zeus 从“能跑”变成“性能和稳定性有框架味道”。

# Phase 6 总目标

Phase 6 的核心目标：

```txt id="hxd4sc"
1. runtime-dom 动态节点更新从全量替换升级为 range 管理
2. For 支持 keyed diff
3. 事件系统从逐个 addEventListener 升级为事件委托
4. 编译器减少无用 DOM path / helper / marker
5. signal 层补 batch / untrack / scheduler 优化
6. 建立 benchmark 和 size report
7. 建立内存泄漏和 cleanup 回归测试
8. 提供 devtools hooks，为后续调试工具做准备
```

你当前 runtime-dom 已经有 `insert / bindText / bindAttr / bindProp / bindEvent / mountShow / mountFor / render` 这些 MVP 能力，Phase 6 会在这些函数之上做优化，而不是换成 VDOM。

---

# Phase 6 边界

## Phase 6 做

```txt id="orn2c7"
runtime:
  - DynamicRange
  - mountDynamic range 化
  - mountFor keyed diff
  - event delegation
  - cleanup tracking
  - class/style patch 快路径

compiler:
  - For by/key 编译
  - bindEvent 委托模式编译
  - 静态表达式 @once
  - 删除无用 child 声明
  - import helper 去重
  - template dedupe 强化

signal:
  - batch(fn)
  - untrack(fn)
  - scheduler queue
  - effect cleanup 稳定

tools:
  - benchmark
  - size report
  - memory test
  - devtools hook
```

## Phase 6 暂不做

```txt id="u2kxox"
SSR
Hydration
Suspense
Transition
Concurrent rendering
跨组件 HMR 精细保状态
完整 devtools 面板
```

---

# Phase 6 最终效果

Phase 6 后，用户可以写：

```tsx id="gmrvyz"
const todos = state([
  { id: 1, title: 'compiler' },
  { id: 2, title: 'runtime' },
])

return (
  <ul>
    <For each={todos} by={todo => todo.id}>
      {todo => <li>{todo.title}</li>}
    </For>
  </ul>
)
```

编译成：

```ts id="svhl6f"
_mountFor(
  _el$,
  _for$,
  () => todos,
  todo => todo.id,
  todo => ...
)
```

runtime 不再每次全量删除重建，而是：

```txt id="ymahgr"
复用已有 item DOM
移动位置
删除消失项
插入新增项
```

事件：

```tsx id="4cfhni"
<button onClick={handleClick}>click</button>
```

不再每个元素都：

```ts id="4yxq4f"
el.addEventListener('click', handleClick)
```

而是：

```ts id="o1e3uw"
el.$$zeusEvents.click = handleClick
delegateEvents(['click'])
```

document 上只绑定一次 click。

---

# Phase 6 模块规划

建议新增 / 调整文件：

```txt id="cmu9pw"
packages/runtime-dom/src/
  range.ts          # DynamicRange
  list.ts           # keyed For diff
  events.ts         # 事件委托升级
  scheduler.ts      # runtime 层调度辅助，可选
  devtools.ts       # runtime devtools hook

packages/signal/src/
  scheduler.ts      # effect scheduler / queueJob
  lifecycle.ts      # onCleanup
  effect.ts         # batch/untrack/getCurrentEffect

packages/compiler/src/
  lower/lowerBuiltin.ts       # For by 属性
  ir/nodes.ts                 # ForIR 增加 by
  codegen/dom/emitBuiltin.ts  # mountFor 新签名
  codegen/dom/emitElement.ts  # 删除无用声明优化
  codegen/dom/emitBinding.ts  # 事件委托模式
```

当前 compiler 已经有 `lower -> passes -> emitDOM` 的主流程，Phase 6 继续沿用这条 pipeline。

---

# 1. runtime-dom：DynamicRange

Phase 2 的 `mountDynamic()` 是：

```txt id="qhgx0f"
remove old nodes
insert new nodes
```

这个简单但性能一般。Phase 6 引入 `DynamicRange`，用于管理一段动态 DOM。

## `range.ts`

```ts id="ktm8pe"
// packages/runtime-dom/src/range.ts

import type { JSXValue } from './types'

export class DynamicRange {
  private nodes: Node[] = []

  constructor(
    private readonly parent: Node,
    private readonly marker: Node | null,
  ) {}

  replace(value: JSXValue): void {
    this.clear()
    this.nodes = insertTracked(this.parent, value, this.marker)
  }

  clear(): void {
    for (const node of this.nodes) {
      node.parentNode?.removeChild(node)
    }

    this.nodes = []
  }

  current(): readonly Node[] {
    return this.nodes
  }
}

export function insertTracked(
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
    const nodes: Node[] = []

    for (const item of value) {
      nodes.push(...insertTracked(parent, item, marker))
    }

    return nodes
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  parent.insertBefore(node, marker)

  return [node]
}

export function removeNodes(nodes: readonly Node[]): void {
  for (const node of nodes) {
    node.parentNode?.removeChild(node)
  }
}

export function moveRangeBefore(
  nodes: readonly Node[],
  parent: Node,
  marker: Node | null,
): void {
  for (const node of nodes) {
    parent.insertBefore(node, marker)
  }
}

export function firstNode(nodes: readonly Node[]): Node | null {
  return nodes[0] ?? null
}

export function lastNode(nodes: readonly Node[]): Node | null {
  return nodes[nodes.length - 1] ?? null
}
```

---

# 2. runtime-dom：mountDynamic range 化

## `insert.ts`

```ts id="ssku69"
// packages/runtime-dom/src/insert.ts

import { effect, onScopeDispose, stop } from '@zeus-js/signal'

import { captureCurrentHostContext, withHostContext } from './hostContext'
import { DynamicRange, insertTracked } from './range'

import type { JSXValue } from './types'

export function insert(
  parent: Node,
  value: JSXValue,
  marker: Node | null = null,
): void {
  if (value === undefined) {
    if (__DEV__) {
      console.warn(
        '[Zeus runtime] insert received `undefined`, which is ignored.',
      )
    }

    return
  }

  insertTracked(parent, value, marker)
}

export function mountDynamic(
  parent: Node,
  marker: Node,
  value: () => JSXValue,
): void {
  const range = new DynamicRange(parent, marker)
  const hostContext = captureCurrentHostContext()

  const runner = effect(() => {
    const next = withHostContext(hostContext, value)
    range.replace(next)
  })

  onScopeDispose(() => {
    stop(runner)
    range.clear()
  }, true)
}
```

这样以后 `Show`、动态组件、动态 children 都基于 range 管理。

---

# 3. runtime-dom：For keyed diff

Phase 2 的 `mountFor()` 是全量替换。Phase 6 升级为 keyed diff。

## API 设计

```tsx id="y248zb"
<For each={todos} by={todo => todo.id}>
  {(todo, index) => <li>{todo.title}</li>}
</For>
```

runtime 签名：

```ts id="lwtk2e"
mountFor<T, K>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: T, index: number) => JSXValue,
): void
```

如果没有 `by`：

```txt id="b5l1pq"
默认按 index 做非 keyed 更新，MVP 可全量替换
```

如果有 `by`：

```txt id="v3opy5"
使用 keyed diff
```

---

## `list.ts`

```ts id="pzkj8l"
// packages/runtime-dom/src/list.ts

import { effect, onScopeDispose, stop } from '@zeus-js/signal'

import { insertTracked, moveRangeBefore, removeNodes } from './range'
import type { JSXValue } from './types'

type Key = unknown

type ListRecord<T> = {
  key: Key
  item: T
  index: number
  nodes: Node[]
}

export function mountFor<T, K = unknown>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  if (!key) {
    mountIndexFor(parent, marker, each, render)
    return
  }

  mountKeyedFor(parent, marker, each, key, render)
}

function mountIndexFor<T>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  let current: Node[] = []

  const runner = effect(() => {
    removeNodes(current)
    current = []

    const list = each() ?? []

    for (let i = 0; i < list.length; i++) {
      current.push(...insertTracked(parent, render(list[i], i), marker))
    }
  })

  onScopeDispose(() => {
    stop(runner)
    removeNodes(current)
    current = []
  }, true)
}

function mountKeyedFor<T, K>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: (item: T, index: number) => K,
  render: (item: T, index: number) => JSXValue,
): void {
  let records: ListRecord<T>[] = []

  const runner = effect(() => {
    const nextItems = each() ?? []
    const oldMap = new Map<Key, ListRecord<T>>()

    for (const record of records) {
      oldMap.set(record.key, record)
    }

    const nextRecords: ListRecord<T>[] = []

    for (let i = 0; i < nextItems.length; i++) {
      const item = nextItems[i]
      const itemKey = key(item, i)
      const oldRecord = oldMap.get(itemKey)

      if (oldRecord) {
        oldMap.delete(itemKey)
        oldRecord.item = item
        oldRecord.index = i
        nextRecords.push(oldRecord)
      } else {
        nextRecords.push({
          key: itemKey,
          item,
          index: i,
          nodes: insertTracked(parent, render(item, i), marker),
        })
      }
    }

    // remove disappeared
    for (const record of oldMap.values()) {
      removeNodes(record.nodes)
    }

    // move to correct order
    for (let i = nextRecords.length - 1; i >= 0; i--) {
      const record = nextRecords[i]
      const anchor =
        i === nextRecords.length - 1
          ? marker
          : (nextRecords[i + 1].nodes[0] ?? marker)

      moveRangeBefore(record.nodes, parent, anchor)
    }

    records = nextRecords
  })

  onScopeDispose(() => {
    stop(runner)

    for (const record of records) {
      removeNodes(record.nodes)
    }

    records = []
  }, true)
}
```

### 注意

这个 keyed diff 是 MVP 级别：

```txt id="2bko35"
能复用和移动 DOM
但 item 内部响应式更新仍建议依赖 state 对象自身
```

如果 list item 是普通对象，替换 item 后旧 DOM 内的闭包仍拿旧 item。更好的方式是给每个 record 建 item state。Phase 6.2 可以升级。

---

# 4. runtime-dom：For 组件升级

## `controlFlow.ts`

```ts id="f7f1vl"
// packages/runtime-dom/src/controlFlow.ts

import { mountFor as mountForRuntime } from './list'
import { mountDynamic } from './insert'
import type { JSXValue } from './types'

export type ForProps<T, K = unknown> = {
  each: readonly T[] | null | undefined
  by?: (item: T, index: number) => K
  children: (item: T, index: number) => JSXValue
}

export function For<T, K = unknown>(props: ForProps<T, K>): JSXValue {
  return props.each?.map((item, index) => props.children(item, index)) ?? null
}

export function mountFor<T, K = unknown>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  mountForRuntime(parent, marker, each, key, render)
}

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

---

# 5. compiler：ForIR 增加 by

当前 `ForIR` 有：

```txt id="0xjeur"
each
item
index
body
```

Phase 6 增加 `by?: t.Expression`。

## `nodes.ts`

```ts id="a1c17g"
export type ForIR = SemanticBaseIRNode & {
  kind: 'For'
  ref: IRRef
  each: t.Expression
  by?: t.Expression
  item: t.Identifier
  index?: t.Identifier
  body: ZeusIRNode[]
  domPath?: DomPath
}
```

---

## `semanticBuilders.ts`

```ts id="tdmb18"
export function forIR(input: {
  ref: IRRef
  each: t.Expression
  by?: t.Expression
  item: t.Identifier
  index?: t.Identifier
  body: ZeusIRNode[]
}): ForIR {
  return {
    id: id(),
    kind: 'For',
    ref: input.ref,
    each: input.each,
    by: input.by,
    item: input.item,
    index: input.index,
    body: input.body,
  }
}
```

---

# 6. compiler：lowerBuiltin 支持 by

当前 `lowerBuiltin.ts` 已经处理 `<For each={...}>`。

修改 `lowerFor()`：

```ts id="e6yfha"
function lowerFor(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const each = requiredExpressionAttr(path, 'each')
  const by = optionalExpressionAttr(path, 'by')
  const render = getOnlyRenderFunction(path)

  const item = getParamIdentifier(render, 0) ?? t.identifier('item')
  const index = getParamIdentifier(render, 1)

  const bodyPath = render.get('body')
  const body: ZeusIRNode[] = []

  if (bodyPath.isJSXElement() || bodyPath.isJSXFragment()) {
    body.push(lowerJSX(bodyPath, context))
  } else if (bodyPath.isExpression()) {
    body.push(dynamicTextIR(bodyPath.node, ref(context.uid('text$').name)))
  }

  return forIR({
    ref: ref(context.uid('for$').name),
    each,
    by,
    item,
    index,
    body,
  })
}
```

限制：

```txt id="j5mq92"
by 必须是表达式：
<For each={list} by={item => item.id}>
```

---

# 7. compiler：emitMountFor 新签名

当前 `emitMountFor()` 调用：

```ts id="9wzwg1"
mountFor(parent, marker, () => each, (item, index) => ...)
```

Phase 6 改成：

```ts id="t6vl1x"
mountFor(parent, marker, () => each, by, (item, index) => ...)
```

## `emitBuiltin.ts`

```ts id="w4ctab"
export function emitMountFor(
  node: ForIR,
  context: CompilerContext,
): t.Expression {
  const params: t.Identifier[] = [node.item]
  const path = node.domPath

  if (node.index) params.push(node.index)

  if (!path || path.kind !== 'Marker') {
    throw new Error('For DOM path is not assigned')
  }

  return t.callExpression(context.importRuntime('mountFor'), [
    t.identifier(path.parent.name),
    emitMarkerIdentifier(node),
    t.arrowFunctionExpression([], node.each),
    node.by ?? t.identifier('undefined'),
    t.arrowFunctionExpression(params, emitChildrenProp(node.body, context)),
  ])
}
```

---

# 8. runtime-dom：事件委托

当前 compiler support 已经有 `appendEvents()`，会生成 `delegateEvents([...])`。

Phase 6 正式实现它。

## 设计

编译：

```tsx id="w7ofoq"
<button onClick={handleClick} />
```

输出：

```ts id="o1m4uo"
_bindEvent(_el$, 'click', handleClick)
```

程序结尾：

```ts id="ns1r2b"
_delegateEvents(['click'])
```

runtime：

```txt id="xihn3i"
bindEvent 只把 handler 存到元素上
delegateEvents 在 document 上注册一次事件
事件冒泡时从 target 往上找 handler
```

---

## `events.ts`

```ts id="xoqtwa"
// packages/runtime-dom/src/events.ts

import { onScopeDispose } from '@zeus-js/signal'

type ZeusEventMap = Record<string, EventListener>

type ZeusElementWithEvents = Element & {
  __zeusEvents?: ZeusEventMap
}

const delegatedEvents = new Set<string>()

export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void {
  const target = el as ZeusElementWithEvents
  const events = (target.__zeusEvents ||= {})

  events[name] = handler

  onScopeDispose(() => {
    if (target.__zeusEvents?.[name] === handler) {
      delete target.__zeusEvents[name]
    }
  }, true)
}

export function delegateEvents(events: readonly string[]): void {
  for (const event of events) {
    if (delegatedEvents.has(event)) continue

    delegatedEvents.add(event)
    document.addEventListener(event, dispatchDelegatedEvent)
  }
}

function dispatchDelegatedEvent(event: Event): void {
  let node = event.target as Node | null

  while (node && node !== document) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as ZeusElementWithEvents
      const handler = el.__zeusEvents?.[event.type]

      if (handler) {
        handler.call(el, event)

        if (event.cancelBubble) {
          return
        }
      }
    }

    node = node.parentNode
  }
}
```

### 事件名转换

`onClick` 应该转 `click`，你当前 lower 层已有 `toEventName()`。保持即可。

---

# 9. compiler：确保事件注册进入 delegateEvents

如果当前 `emitEventBinding()` 只输出 `bindEvent()`，还需要注册事件名：

```ts id="3ntpb2"
registerEvent(...)
```

当前 support 里有 `registerEvent()`，但要确认 `emitEventBinding()` 调用它。

## 修改 `emitBinding.ts`

```ts id="kz2jh9"
import { registerEvent } from '../support/events'
```

注意你的路径可能是：

```ts id="vf6fq9"
import { registerEvent } from '../support'
```

具体按当前 `codegen/support/index.ts` 导出为准。

```ts id="ws8g3i"
function emitEventBinding(
  target: ElementIR,
  binding: EventBindingIR,
  context: CompilerContext,
): t.Statement {
  registerEvent(context.programPath, binding.eventName)

  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindEvent'), [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.eventName),
      binding.handler,
    ]),
  )
}
```

如果 `registerEvent()` 需要 NodePath，而不是 ProgramPath，就调整 `CompilerContext` 增加原始 path 或新增方法：

```ts id="yc2402"
context.registerEvent(binding.eventName)
```

更推荐给 `CompilerContext` 加方法。

---

# 10. CompilerContext 增加 registerEvent

当前 `CompilerContext` 已经有 `importRuntime()`、`registerTemplate()`。

加：

```ts id="5k1jlk"
// packages/compiler/src/context/CompilerContext.ts

export class CompilerContext {
  // ...

  registerEvent(eventName: string): void {
    const scopeData = this.programPath.scope.data as ProgramScopeData
    const events = (scopeData.events ||= new Set())
    events.add(eventName)
  }
}
```

然后 `emitEventBinding()`：

```ts id="8xvf9v"
function emitEventBinding(
  target: ElementIR,
  binding: EventBindingIR,
  context: CompilerContext,
): t.Statement {
  context.registerEvent(binding.eventName)

  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindEvent'), [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.eventName),
      binding.handler,
    ]),
  )
}
```

---

# 11. compiler：appendEvents 保持开启

`program.ts` 保持：

```ts id="1f7q21"
appendTemplates(path)
appendEvents(path)
appendImportMethods(path)
```

当前就是这个顺序。

注意 `appendEvents()` 要在 `appendImportMethods()` 前执行，因为它内部也会注册 `delegateEvents` import。

---

# 12. compiler：删除无用 child 声明

当前 `emitElementDeclarations()` 会为静态子元素声明变量，即使只是为了 DOM path 可能有些变量没用。

比如：

```tsx id="b3fbyf"
<div>
  <span />
  {name}
</div>
```

为了后续 marker 定位，可能会声明 `_el$2 = _el$.firstChild`，但没有用。

Phase 6 优化：只为 **有 runtime work 的 element** 生成声明。

## 改造思路

```ts id="uggutx"
function needsElementRef(node: ElementIR): boolean {
  return hasOwnBindings(node) || hasChildRuntimeWork(node)
}
```

但是如果子元素本身没有 binding，而它的后代有 binding，就仍然需要它的 ref。

实现：

```ts id="u1chmr"
function emitElementDeclarations(
  children: ZeusIRNode[],
  context: CompilerContext,
): t.Statement[] {
  const statements: t.Statement[] = []

  for (const child of children) {
    if (child.kind === 'Element') {
      if (needsElementDeclaration(child)) {
        statements.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(child.ref.name),
              emitDomPath(child.domPath!, context),
            ),
          ]),
        )
      }

      statements.push(...emitElementDeclarations(child.children, context))
      continue
    }

    if (child.kind === 'Fragment') {
      statements.push(...emitElementDeclarations(child.children, context))
    }
  }

  return statements
}

function needsElementDeclaration(node: ElementIR): boolean {
  if (node.attrs.some(attr => attr.kind !== 'StaticAttribute')) {
    return true
  }

  return node.children.some(child => {
    switch (child.kind) {
      case 'DynamicText':
      case 'Component':
      case 'Show':
      case 'For':
      case 'Slot':
        return true

      case 'Element':
        return needsElementDeclaration(child)

      case 'Fragment':
        return child.children.some(inner =>
          inner.kind === 'Element'
            ? needsElementDeclaration(inner)
            : inner.kind !== 'Text',
        )

      default:
        return false
    }
  })
}
```

---

# 13. static expression `@once`

配置里已经有 `staticMarker: '@once'`，Phase 6 可以启用。

目标：

```tsx id="exev92"
<div>{/* @once */ expensive()}</div>
```

或者：

```tsx id="8xzqj1"
<div>{expensive() /* @once */}</div>
```

编译成静态插入，不包 `bindText()`。

## 简化实现

在 `lowerExpression.ts` 里判断 JSXExpressionContainer 是否包含 `@once` 注释：

```ts id="52t6y2"
function hasStaticMarker(expr: t.Expression, marker: string): boolean {
  const comments = [
    ...(expr.leadingComments ?? []),
    ...(expr.trailingComments ?? []),
    ...(expr.innerComments ?? []),
  ]

  return comments.some(comment => comment.value.includes(marker))
}
```

如果是 `@once`：

```txt id="jhl7to"
不要生成 DynamicTextIR
生成 StaticOnceIR 或保留 DynamicTextIR 但标记 once
```

最小改法：给 `DynamicTextIR` 加：

```ts id="7qzfp8"
once?: boolean
```

`nodes.ts`：

```ts id="g4zrdg"
export type DynamicTextIR = SemanticBaseIRNode & {
  kind: 'DynamicText'
  expr: t.Expression
  ref: IRRef
  once?: boolean
  domPath?: DomPath
}
```

builder：

```ts id="dizmag"
export function dynamicTextIR(
  expr: t.Expression,
  nodeRef: IRRef,
  once = false,
): DynamicTextIR {
  return {
    id: id(),
    kind: 'DynamicText',
    expr,
    ref: nodeRef,
    once,
  }
}
```

emit：

```ts id="rnlxhj"
if (node.once) {
  return [
    // create text node with initial value
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.ref.name),
        t.callExpression(
          t.memberExpression(
            t.identifier('document'),
            t.identifier('createTextNode'),
          ),
          [t.callExpression(t.identifier('String'), [node.expr])],
        ),
      ),
    ]),
    // insert only, no bindText
  ]
}
```

这可以减少无需响应的表达式开销。

---

# 14. signal：scheduler queue

Phase 1 已经提过 `batch()` / `untrack()`。Phase 6 重点是调度队列。

## `scheduler.ts`

```ts id="x7iw99"
// packages/signal/src/scheduler.ts

const queue = new Set<() => void>()
let flushing = false
let pending = false

export function queueJob(job: () => void): void {
  queue.add(job)

  if (!pending) {
    pending = true
    queueMicrotask(flushJobs)
  }
}

export function flushJobs(): void {
  if (flushing) return

  pending = false
  flushing = true

  try {
    for (const job of queue) {
      job()
    }
  } finally {
    queue.clear()
    flushing = false
  }
}

export function nextTick(): Promise<void> {
  return Promise.resolve()
}
```

## effect 选项支持 scheduler

如果当前 `effect()` 已经支持 scheduler，就只要文档化。否则补：

```ts id="j2sbyr"
export interface ReactiveEffectOptions {
  scheduler?: EffectScheduler
  onStop?: () => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}
```

用户可以：

```ts id="fr3ux5"
effect(fn, {
  scheduler: () => queueJob(fn),
})
```

runtime 默认仍然同步，避免 UI 延迟；批量更新由 `batch()` 控制。

---

# 15. runtime devtools hooks

Phase 6 只做 hook，不做 UI 面板。

## `devtools.ts`

```ts id="ja2wfl"
// packages/runtime-dom/src/devtools.ts

export type ZeusDevtoolsEvent =
  | {
      type: 'render'
      target: Element | DocumentFragment
    }
  | {
      type: 'effect'
      name?: string
    }
  | {
      type: 'mount-for'
      length: number
    }
  | {
      type: 'delegate-event'
      event: string
    }

export type ZeusDevtoolsHook = {
  emit: (event: ZeusDevtoolsEvent) => void
}

declare global {
  interface Window {
    __ZEUS_DEVTOOLS_HOOK__?: ZeusDevtoolsHook
  }
}

export function emitDevtoolsEvent(event: ZeusDevtoolsEvent): void {
  if (typeof window === 'undefined') return
  window.__ZEUS_DEVTOOLS_HOOK__?.emit(event)
}
```

在 `render()`：

```ts id="25umdv"
emitDevtoolsEvent({
  type: 'render',
  target: container,
})
```

在 `delegateEvents()`：

```ts id="927nk0"
emitDevtoolsEvent({
  type: 'delegate-event',
  event,
})
```

---

# 16. benchmark 设计

新增：

```txt id="d00z8q"
packages/benchmarks/
  package.json
  src/
    signal.bench.ts
    runtime.bench.ts
    list.bench.ts
```

或者沿用你 root 的 `test:benchs`：

```json id="q8anrb"
"test:benchs": "vitest bench packages/signal/src/__tests__/benchs/"
```

当前 root 已经有 bench 脚本，可以继续用。

---

## `packages/runtime-dom/__tests__/bench/list.bench.ts`

```ts id="5c6vfh"
import { bench, describe } from 'vitest'

import { state } from '@zeus-js/signal'
import { mountFor } from '../src'

describe('runtime keyed For', () => {
  bench('create 1000 items', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 1000 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )
  })

  bench('move 1000 items reverse', () => {
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    parent.appendChild(marker)

    const list = state(
      Array.from({ length: 1000 }, (_, id) => ({
        id,
        title: `item ${id}`,
      })),
    )

    mountFor(
      parent,
      marker,
      () => list,
      item => item.id,
      item => {
        const li = document.createElement('li')
        li.textContent = item.title
        return li
      },
    )

    list.reverse()
  })
})
```

---

# 17. size report

新增脚本：

```txt id="oyvndd"
scripts/size-report.ts
```

```ts id="vpotgq"
import { gzipSync } from 'node:zlib'
import { statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const files = [
  'packages/signal/dist/signal.esm-browser.prod.js',
  'packages/runtime-dom/dist/runtime-dom.esm-browser.prod.js',
  'packages/compiler/dist/compiler.esm-bundler.js',
  'packages/zeus/dist/zeus.esm-browser.prod.js',
]

for (const file of files) {
  const path = resolve(process.cwd(), file)
  const raw = readFileSync(path)
  const gzip = gzipSync(raw)

  console.log(
    `${file}
  raw:  ${(statSync(path).size / 1024).toFixed(2)} KB
  gzip: ${(gzip.length / 1024).toFixed(2)} KB`,
  )
}
```

root package：

```json id="a0e37s"
{
  "scripts": {
    "size": "pnpm build && tsx scripts/size-report.ts"
  }
}
```

---

# 18. memory cleanup 测试

重点防止：

```txt id="fg5h3v"
事件未解绑
ref 未清空
For 删除节点未清理
effectScope 未停止
mountDynamic 旧节点残留
```

## `runtime-dom/__tests__/cleanup.spec.ts`

```ts id="db2sow"
import { describe, expect, it, vi } from 'vitest'

import { scope, state } from '@zeus-js/signal'
import { bindEvent, bindRef, mountFor } from '../src'

describe('runtime cleanup', () => {
  it('removes delegated event handler on scope stop', () => {
    const s = scope()
    const button = document.createElement('button')
    const fn = vi.fn()

    s.run(() => {
      bindEvent(button, 'click', fn)
    })

    button.click()
    expect(fn).toHaveBeenCalledTimes(1)

    s.stop()

    button.click()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('clears ref on scope stop', () => {
    const s = scope()
    const el = document.createElement('input')
    const input = state<HTMLInputElement | null>(null)

    s.run(() => {
      bindRef(el, input)
    })

    expect(input.value).toBe(el)

    s.stop()

    expect(input.value).toBe(null)
  })

  it('removes list nodes on scope stop', () => {
    const s = scope()
    const parent = document.createElement('ul')
    const marker = document.createComment('')
    const list = state([{ id: 1 }])

    parent.appendChild(marker)

    s.run(() => {
      mountFor(
        parent,
        marker,
        () => list,
        item => item.id,
        item => {
          const li = document.createElement('li')
          li.textContent = String(item.id)
          return li
        },
      )
    })

    expect(parent.childNodes.length).toBe(2)

    s.stop()

    expect(parent.childNodes.length).toBe(1)
    expect(parent.firstChild).toBe(marker)
  })
})
```

---

# 19. Phase 6 任务拆分

## Phase 6.1：DynamicRange

```txt id="a4q7ko"
- 新增 range.ts
- mountDynamic 使用 DynamicRange
- Show 复用 mountDynamic
- 动态 children 清理稳定
```

---

## Phase 6.2：For keyed diff

```txt id="mbco04"
- runtime list.ts
- mountFor 支持 key function
- ForProps 增加 by
- compiler ForIR 增加 by
- lowerBuiltin 解析 by
- emitMountFor 传 by
```

---

## Phase 6.3：事件委托

```txt id="btq8wz"
- bindEvent 改为存 handler
- delegateEvents 注册 document listener
- CompilerContext.registerEvent()
- emitEventBinding 注册事件名
- appendEvents 保持开启
```

---

## Phase 6.4：编译产物优化

```txt id="7s3oqq"
- static className -> class
- 无用 element declaration 删除
- @once 静态表达式
- helper import 去重确认
- template dedupe benchmark
```

---

## Phase 6.5：signal 调度能力

```txt id="fbh9pk"
- batch(fn)
- untrack(fn)
- queueJob()
- nextTick()
- effect scheduler 测试
```

---

## Phase 6.6：benchmark 与 size

```txt id="a3jwgq"
- signal bench
- runtime bench
- keyed list bench
- compiler output size snapshot
- scripts/size-report.ts
```

---

## Phase 6.7：devtools hook

```txt id="5e5cak"
- __ZEUS_DEVTOOLS_HOOK__
- render event
- delegate-event event
- mount-for event
```

---

# 20. Phase 6 完成标准

Phase 6 完成后，下面这些能力要成立：

```txt id="pj4i6e"
1. Show / dynamic children 使用 DynamicRange 管理
2. For each + by 可以复用和移动 DOM
3. bindEvent + delegateEvents 可以实现事件委托
4. scope.stop() 后事件、ref、For 节点都能清理
5. compiler 能把 <For by={...}> 编译到 mountFor 新签名
6. compiler 能收集事件并生成 delegateEvents([...])
7. 编译产物中无明显无用 child 声明
8. @once 表达式不创建响应式绑定
9. benchmark 可以跑
10. size report 可以输出
```

---

# 21. 最终结论

Phase 6 的核心是：

```txt id="wg0wgv"
从“能用的 compiled DOM framework”
升级为
“有性能意识的 compiled fine-grained framework”。
```

技术重点是：

```txt id="rlke5z"
DynamicRange
Keyed For
Event Delegation
Compile Output Optimization
Scheduler
Benchmark
Cleanup Tests
```

这一步做完之后，Zeus 的框架路线就比较清晰了：

```txt id="tpqhhk"
state() 统一状态
+
compiler 生成 DOM helper
+
runtime-dom 细粒度更新
+
keyed diff / event delegation / cleanup
+
benchmark 约束后续优化
```

也就是从 Demo 框架进入“可以认真优化和对比 Solid/Svelte/Vue petite reactivity”的阶段。
