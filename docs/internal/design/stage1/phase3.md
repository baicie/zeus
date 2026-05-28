下面给你一版 **Phase 3：Compiler MVP 闭环** 的“可落地实现版”。
它基于你当前仓库已有结构来设计：当前 compiler 已经有 `lower -> passes -> emitDOM` 的流程，而且 `RefBindingIR` / `refBindingIR()` 已经存在，所以 Phase 3 不需要推倒重来，重点是把 **JSX 语义完整编译到 Phase 2 runtime-dom helper**。

当前编译主流程已经是：

```txt id="oeuy2s"
lowerJSX
normalizeChildren
validateBuiltins
assignDomPaths
analyzeBindings
collectTemplates
emitDOM
```

这个方向是对的，Phase 3 就是在这条 pipeline 上补齐 JSX MVP。

# Phase 3：Compiler MVP 闭环

## 目标

Phase 3 的目标是让下面这种 TSX 可以稳定编译：

```tsx id="ybuc78"
import { state } from '@zeus-js/signal'

function App() {
  const count = state(0)
  const user = state({
    name: 'Zeus',
    active: true,
  })

  const input = state<HTMLInputElement | null>(null)

  return (
    <div class={{ active: user.active }}>
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

      <Show when={count.value > 0} fallback={<span>empty</span>}>
        <span>{count.value}</span>
      </Show>

      <For each={[1, 2, 3]}>{item => <span>{item}</span>}</For>
    </div>
  )
}
```

编译产物要调用 Phase 2 runtime：

```txt id="1qsbcq"
template()
child()
marker()
insert()
bindText()
bindAttr()
bindProp()
bindClass()
bindStyle()
bindEvent()
bindRef()
createComponent()
mountShow()
mountFor()
```

当前 compiler snapshot 已经会生成 `_template / _insert / _bindText / _createComponent / _marker` 这类 helper 调用，Phase 3 要继续沿用这条路线，不要切换到 VDOM。

---

# Phase 3 实现边界

## Phase 3 必须做

```txt id="56qtsu"
1. DOM 元素编译
2. 静态模板提升
3. 动态文本绑定
4. 动态 attr / prop / class / style / event / ref 编译
5. 组件调用编译
6. Fragment 编译
7. Show / For 编译
8. JSX ref={} 编译到 bindRef()
9. compiler snapshot 测试补齐
10. 与 runtime-dom helper 名称对齐
```

## Phase 3 暂不做

```txt id="q89o9k"
1. keyed For diff
2. spread attributes 完整支持
3. SSR
4. Hydration
5. Suspense
6. Transition
7. Portal
8. Context
9. Host / Slot / Web Components 完整语义
```

`Host / Slot` 目前 IR 已经有，但建议 Phase 5 再重点做。

---

# 当前已有基础

你当前 IR 已经包含：

```txt id="wlwnr0"
Element
Text
DynamicText
StaticAttribute
AttrBinding
PropBinding
EventBinding
RefBinding
Component
Fragment
Show
For
Host
Slot
```

这很好，说明 Phase 3 可以直接补 codegen，而不需要重新设计 IR。

`semanticBuilders.ts` 里也已经有 `refBindingIR()`，说明 JSX ref 的 IR 层已经具备基础。

---

# 最终编译策略

## 静态内容

```tsx id="c9k7iz"
<div id="app">hello</div>
```

编译为：

```ts id="2x9fps"
import { template as _template } from '@zeus-js/runtime-dom'

var _tmpl$ = /*#__PURE__*/ _template(`<div id="app">hello</div>`)

const App = () => _tmpl$().firstChild
```

---

## 动态文本

```tsx id="jgmo8k"
<div>{user.name}</div>
```

编译为：

```ts id="h4rmdx"
import {
  template as _template,
  marker as _marker,
  insert as _insert,
  bindText as _bindText,
} from '@zeus-js/runtime-dom'

var _tmpl$ = /*#__PURE__*/ _template(`<div><!></div>`)

const App = () =>
  (() => {
    const _el$ = _tmpl$().firstChild
    const _marker$ = _marker(_el$, 0)
    const _text$ = document.createTextNode('')

    _insert(_el$, _text$, _marker$)
    _bindText(_text$, () => user.name)

    return _el$
  })()
```

---

## 动态属性

```tsx id="w4xbi5"
<div title={user.name} />
```

编译为：

```ts id="yfcygc"
_bindAttr(_el$, 'title', () => user.name)
```

---

## 动态 class

```tsx id="r7r7vk"
<div class={{ active: user.active }} />
```

编译为：

```ts id="3nxt95"
_bindClass(_el$, () => ({ active: user.active }))
```

---

## 动态 style

```tsx id="ux0lic"
<div style={{ width: count.value }} />
```

编译为：

```ts id="6wjwgy"
_bindStyle(_el$, () => ({ width: count.value }))
```

---

## DOM property

```tsx id="ka785w"
<input prop:value={user.name} />
```

编译为：

```ts id="56x86u"
_bindProp(_el$, 'value', () => user.name)
```

---

## 事件

```tsx id="7t5dps"
<button onClick={() => count.value++} />
```

编译为：

```ts id="c3si9e"
_bindEvent(_el$, 'click', () => count.value++)
```

---

## JSX ref

```tsx id="ozocit"
<input ref={input} />
```

编译为：

```ts id="ucpo1r"
_bindRef(_el$, input)
```

---

# 文件级实现

下面按文件给实现草案。

---

# 1. `nodes.ts`

你当前已经有 `RefBindingIR`，不需要大改。保留即可：

```ts id="fnwjz2"
export type RefBindingIR = SemanticBaseIRNode & {
  kind: 'RefBinding'
  expr: t.Expression
}

export type AttributeIR =
  | StaticAttributeIR
  | AttrBindingIR
  | PropBindingIR
  | EventBindingIR
  | RefBindingIR
```

当前分支里已经是这个结构。

如果后面想把 `class/style` 单独建 IR，也可以加：

```ts id="vfzc6r"
export type ClassBindingIR = SemanticBaseIRNode & {
  kind: 'ClassBinding'
  expr: t.Expression
}

export type StyleBindingIR = SemanticBaseIRNode & {
  kind: 'StyleBinding'
  expr: t.Expression
}
```

但 Phase 3 MVP 不必加。直接在 emit 阶段根据 attr name 分发即可。

---

# 2. `semanticBuilders.ts`

你当前已经有：

```ts id="dl94s3"
export function refBindingIR(expr: t.Expression): RefBindingIR {
  return {
    id: id(),
    kind: 'RefBinding',
    expr,
  }
}
```

这个保留即可。

---

# 3. `lowerAttribute.ts`

目标：

```txt id="c7uv9l"
ref={x}       -> RefBindingIR
onClick={fn}  -> EventBindingIR
prop:value={} -> PropBindingIR
class={}      -> AttrBindingIR，emit 时转 bindClass
style={}      -> AttrBindingIR，emit 时转 bindStyle
title={}      -> AttrBindingIR
```

实现草案：

```ts id="eqgz14"
import * as t from '@babel/types'

import { CompilerError, CompilerErrorCode } from '../diagnostics'
import {
  attrBindingIR,
  eventBindingIR,
  propBindingIR,
  refBindingIR,
  staticAttrIR,
} from '../ir/semanticBuilders'
import { getJSXAttrName, toEventName } from '../parse/jsx'

import type { CompilerContext } from '../context'
import type { AttributeIR } from '../ir/nodes'
import type { NodePath } from '@babel/core'

export function lowerAttribute(
  path: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
  _context: CompilerContext,
): AttributeIR | null {
  if (path.isJSXSpreadAttribute() || t.isJSXSpreadAttribute(path.node)) {
    throw new CompilerError({
      code: CompilerErrorCode.UNSUPPORTED_SPREAD_ATTRIBUTE,
      message: 'Spread attributes are not supported in Zeus MVP.',
      path,
      hint: 'Use explicit attributes instead, for example <div id={id} />.',
    })
  }

  const node = path.node
  const name = getJSXAttrName(node.name)
  const value = node.value

  if (!value) {
    if (name === 'ref') {
      throw new CompilerError({
        code: CompilerErrorCode.INVALID_REF_USAGE,
        message: 'ref attribute requires an expression.',
        path,
        hint: 'Use <div ref={target} /> instead.',
      })
    }

    return staticAttrIR(name, true)
  }

  if (t.isStringLiteral(value)) {
    if (name === 'ref') {
      throw new CompilerError({
        code: CompilerErrorCode.INVALID_REF_USAGE,
        message: 'String refs are not supported in Zeus.',
        path,
        hint: 'Use a state holder or callback ref: <div ref={target} />.',
      })
    }

    return staticAttrIR(name, value.value)
  }

  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression

    if (t.isJSXEmptyExpression(expr)) {
      throw new CompilerError({
        code: CompilerErrorCode.EMPTY_EXPRESSION,
        message: `Attribute "${name}" expression cannot be empty.`,
        path,
      })
    }

    if (name === 'ref') {
      return refBindingIR(expr)
    }

    if (name.startsWith('on') && name.length > 2) {
      return eventBindingIR(toEventName(name), expr)
    }

    if (name.startsWith('prop:')) {
      return propBindingIR(name.slice('prop:'.length), expr)
    }

    return attrBindingIR(name, expr)
  }

  return null
}
```

你当前 `lowerAttribute.ts` 已经有事件、prop、spread 错误处理逻辑，这里主要是把 `ref` 放进去。

---

# 4. `diagnostics.ts`

需要新增错误码：

```ts id="h8lfnd"
export enum CompilerErrorCode {
  EMPTY_EXPRESSION = 'EMPTY_EXPRESSION',
  UNSUPPORTED_SPREAD_ATTRIBUTE = 'UNSUPPORTED_SPREAD_ATTRIBUTE',
  UNSUPPORTED_COMPONENT_PROP = 'UNSUPPORTED_COMPONENT_PROP',
  INVALID_BUILTIN_USAGE = 'INVALID_BUILTIN_USAGE',
  INVALID_REF_USAGE = 'INVALID_REF_USAGE',
}
```

如果你当前是数字 enum，就按已有风格加一项即可。

---

# 5. `emitBinding.ts`

这是 Phase 3 的关键。

当前 `emitBinding.ts` 已经能处理：

```txt id="a37wa9"
AttrBinding
EventBinding
PropBinding
DynamicText
Component
Show
For
Slot
```

Phase 3 要补：

```txt id="po5v6e"
RefBinding
class/className -> bindClass
style -> bindStyle
```

当前文件已经负责将动态绑定转换成 runtime helper 调用，这是正确位置。

完整实现草案：

```ts id="jn3pxu"
import * as t from '@babel/types'

import { emitMountFor, emitMountShow, emitSlot } from './emitBuiltin'
import { emitComponent } from './emitComponent'
import { emitDomPath } from './emitDomPath'

import type { CompilerContext } from '../../context'
import type {
  AttrBindingIR,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
  ForIR,
  PropBindingIR,
  RefBindingIR,
  ShowIR,
  SlotIR,
  ZeusIRNode,
} from '../../ir/nodes'

export function emitBindings(
  node: ElementIR,
  context: CompilerContext,
): t.Statement[] {
  const statements: t.Statement[] = []

  for (const attr of node.attrs) {
    switch (attr.kind) {
      case 'AttrBinding':
        statements.push(emitAttrBinding(node, attr, context))
        break

      case 'EventBinding':
        statements.push(emitEventBinding(node, attr, context))
        break

      case 'PropBinding':
        statements.push(emitPropBinding(node, attr, context))
        break

      case 'RefBinding':
        statements.push(emitRefBinding(node, attr, context))
        break
    }
  }

  for (const child of node.children) {
    statements.push(...emitChildBinding(child, context))
  }

  return statements
}

function emitChildBinding(
  node: ZeusIRNode,
  context: CompilerContext,
): t.Statement[] {
  switch (node.kind) {
    case 'DynamicText':
      return emitDynamicText(node, context)

    case 'Component':
      return emitComponentInsert(node, context)

    case 'Show':
      return emitMarkerMount(node, context, emitMountShow(node, context))

    case 'For':
      return emitMarkerMount(node, context, emitMountFor(node, context))

    case 'Slot':
      return emitMarkerInsert(node, context, emitSlot(node, context))

    case 'Element':
      return emitBindings(node, context)

    case 'Fragment':
      return node.children.flatMap(child => emitChildBinding(child, context))

    default:
      return []
  }
}

function emitAttrBinding(
  target: ElementIR,
  binding: AttrBindingIR,
  context: CompilerContext,
): t.Statement {
  const name = normalizeAttrName(binding.name)

  if (name === 'class') {
    return t.expressionStatement(
      t.callExpression(context.importRuntime('bindClass'), [
        t.identifier(target.ref.name),
        t.arrowFunctionExpression([], binding.expr),
      ]),
    )
  }

  if (name === 'style') {
    return t.expressionStatement(
      t.callExpression(context.importRuntime('bindStyle'), [
        t.identifier(target.ref.name),
        t.arrowFunctionExpression([], binding.expr),
      ]),
    )
  }

  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindAttr'), [
      t.identifier(target.ref.name),
      t.stringLiteral(name),
      t.arrowFunctionExpression([], binding.expr),
    ]),
  )
}

function emitEventBinding(
  target: ElementIR,
  binding: EventBindingIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindEvent'), [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.eventName),
      binding.handler,
    ]),
  )
}

function emitPropBinding(
  target: ElementIR,
  binding: PropBindingIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindProp'), [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.name),
      t.arrowFunctionExpression([], binding.expr),
    ]),
  )
}

function emitRefBinding(
  target: ElementIR,
  binding: RefBindingIR,
  context: CompilerContext,
): t.Statement {
  return t.expressionStatement(
    t.callExpression(context.importRuntime('bindRef'), [
      t.identifier(target.ref.name),
      binding.expr,
    ]),
  )
}

function emitDynamicText(
  node: DynamicTextIR,
  context: CompilerContext,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  const markerRef = context.uid('marker$')

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(markerRef, emitDomPath(node.domPath, context)),
    ]),

    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.ref.name),
        t.callExpression(
          t.memberExpression(
            t.identifier('document'),
            t.identifier('createTextNode'),
          ),
          [t.stringLiteral('')],
        ),
      ),
    ]),

    t.expressionStatement(
      t.callExpression(context.importRuntime('insert'), [
        t.identifier(node.domPath.parent.name),
        t.identifier(node.ref.name),
        t.cloneNode(markerRef),
      ]),
    ),

    t.expressionStatement(
      t.callExpression(context.importRuntime('bindText'), [
        t.identifier(node.ref.name),
        t.arrowFunctionExpression([], node.expr),
      ]),
    ),
  ]
}

function emitComponentInsert(
  node: ComponentIR,
  context: CompilerContext,
): t.Statement[] {
  return emitMarkerInsert(node, context, emitComponent(node, context))
}

function emitMarkerInsert(
  node: ComponentIR | ShowIR | ForIR | SlotIR,
  context: CompilerContext,
  value: t.Expression,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  const markerRef = context.uid('marker$')

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(markerRef, emitDomPath(node.domPath, context)),
    ]),

    t.expressionStatement(
      t.callExpression(context.importRuntime('insert'), [
        t.identifier(node.domPath.parent.name),
        value,
        t.cloneNode(markerRef),
      ]),
    ),
  ]
}

function emitMarkerMount(
  node: ShowIR | ForIR,
  context: CompilerContext,
  mountCall: t.Expression,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.ref.name),
        emitDomPath(node.domPath, context),
      ),
    ]),

    t.expressionStatement(mountCall),
  ]
}

function normalizeAttrName(name: string): string {
  return name === 'className' ? 'class' : name
}
```

---

# 6. `emitElement.ts`

当前 `emitElement.ts` 通过 `hasRuntimeWork()` 判断是否需要生成 IIFE，如果没有动态工作就直接返回模板 clone。

Phase 3 要把 `RefBinding` 也算作 runtime work。

```ts id="ub89pz"
function hasRuntimeWork(node: ElementIR): boolean {
  return (
    node.attrs.some(
      attr =>
        attr.kind === 'AttrBinding' ||
        attr.kind === 'PropBinding' ||
        attr.kind === 'EventBinding' ||
        attr.kind === 'RefBinding',
    ) || node.children.some(hasChildRuntimeWork)
  )
}
```

否则：

```tsx id="bvjv8t"
<input ref={input} />
```

会被当成纯静态元素，导致不会生成 `_bindRef()`。

---

# 7. `collectTemplates.ts`

当前模板收集只把 `StaticAttribute` 写入 HTML，这个方向是对的。动态 attr、event、ref 都不应该进入静态模板。

但 Phase 3 要优化两个点：

## 7.1 className 静态归一化

```tsx id="67wv27"
<div className="box" />
```

应该输出：

```html id="qf0y68"
<div class="box"></div>
```

修改：

```ts id="12cdbb"
function normalizeStaticAttrName(name: string): string {
  return name === 'className' ? 'class' : name
}
```

在 `renderTemplateHTML()` 中：

```ts id="akb6sh"
const attrs = node.attrs
  .filter(attr => attr.kind === 'StaticAttribute')
  .map(attr => {
    if (attr.kind !== 'StaticAttribute') return ''

    const name = normalizeStaticAttrName(attr.name)

    if (attr.value === true) return ` ${name}`
    return ` ${name}="${escapeAttr(attr.value)}"`
  })
  .join('')
```

## 7.2 静态 style 字符串保留

```tsx id="s0rzgr"
<div style="color:red" />
```

可以作为静态 attr 进模板。

但：

```tsx id="kmhpan"
<div style={{ color: 'red' }} />
```

应该走 `bindStyle()`。

---

# 8. `lowerComponent.ts`

当前组件 prop 逻辑已经支持：

```txt id="b3916o"
boolean prop
string prop
expression prop
children prop
```

但 spread props 不支持。

Phase 3 MVP 可以继续不支持 spread props，但要优化 children。

当前 children 编译成：

```ts id="a96cai"
props.children = emitChildrenProp(children)
```

这个可以保留。

但有一个重要问题：**组件 prop 的表达式如果是动态 state 读取，是否需要 getter？**

比如：

```tsx id="l07ywy"
<MyTitle title={user.name} />
```

当前会编译成：

```ts id="tffevk"
_createComponent(MyTitle, {
  title: user.name,
})
```

这会在创建组件时读取一次 `user.name`。如果 `MyTitle` 内部希望 props.title 响应式变化，这样是不够的。

Phase 3 有两个选择。

---

## 方案 A：MVP 简单 props，动态由父级重新插入

当前 runtime 没有组件实例更新机制，所以可以先接受：

```txt id="pdc8ir"
组件 props 是创建时值
响应式更新由组件内部自己管理
```

这个简单，但能力弱。

---

## 方案 B：动态 prop 编译为 getter

```tsx id="fzryxk"
<MyTitle title={user.name} />
```

编译为：

```ts id="epmjyb"
_createComponent(MyTitle, {
  get title() {
    return user.name
  },
})
```

组件内：

```tsx id="2mbe6n"
function MyTitle(props) {
  return <h1>{props.title}</h1>
}
```

编译器把 `{props.title}` 编译成 `() => props.title`，runtime `effect` 执行时会触发 getter，从而追踪 `user.name`。

我建议 Phase 3 采用 **方案 B**。

---

## 修改 `emitComponent.ts`

当前 `emitComponent()` 直接生成 `objectProperty`。

改成：表达式 prop 生成 getter，静态 literal 可以直接 property。

```ts id="0c0svl"
import * as t from '@babel/types'

import { emitElement } from './emitElement'
import { emitFragment } from './emitFragment'

import type { CompilerContext } from '../../context'
import type { ComponentIR, ComponentPropIR, ZeusIRNode } from '../../ir/nodes'

export function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('createComponent'), [
    node.callee,
    t.objectExpression(
      node.props.map(prop => emitComponentProp(prop, context)),
    ),
  ])
}

function emitComponentProp(
  prop: ComponentPropIR,
  context: CompilerContext,
): t.ObjectProperty | t.ObjectMethod {
  const key = createObjectKey(prop.name)

  if (Array.isArray(prop.value)) {
    return t.objectProperty(key, emitChildrenProp(prop.value, context))
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

function isStaticPropValue(value: t.Expression): boolean {
  return (
    t.isStringLiteral(value) ||
    t.isNumericLiteral(value) ||
    t.isBooleanLiteral(value) ||
    t.isNullLiteral(value)
  )
}

export function emitChildrenProp(
  children: ZeusIRNode[],
  context: CompilerContext,
): t.Expression {
  const nodes = children.map(child => emitChildProp(child, context))

  if (nodes.length === 1) return nodes[0]
  return t.arrayExpression(nodes)
}

export function emitChildProp(
  node: ZeusIRNode,
  context: CompilerContext,
): t.Expression {
  switch (node.kind) {
    case 'Text':
      return t.stringLiteral(node.value)

    case 'DynamicText':
      return node.expr

    case 'Element':
      return emitElement(node, context)

    case 'Component':
      return emitComponent(node, context)

    case 'Fragment':
      return emitFragment(node, context)

    case 'Show':
    case 'For':
    case 'Slot':
    case 'Host':
      return context.importRuntime('insert') ? t.nullLiteral() : t.nullLiteral()

    default:
      return t.nullLiteral()
  }
}

function createObjectKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}
```

上面 `emitChildProp()` 里 `Show/For` 暂时返回 `null` 不理想。更好的做法是复用 `emitDOM()`，但会产生循环依赖。建议单独抽一个 `emitNodeExpression()` 工具，见下一节。

---

# 9. 抽 `emitNodeExpression.ts`

为避免 `emitComponent.ts` 和 `emitBuiltin.ts` 互相依赖混乱，新增：

```txt id="m7ti9y"
packages/compiler/src/codegen/dom/emitNodeExpression.ts
```

```ts id="qyng0u"
import * as t from '@babel/types'

import { emitFor, emitHost, emitShow, emitSlot } from './emitBuiltin'
import { emitComponent } from './emitComponent'
import { emitElement } from './emitElement'
import { emitFragment } from './emitFragment'

import type { CompilerContext } from '../../context'
import type { ZeusIRNode } from '../../ir/nodes'

export function emitNodeExpression(
  node: ZeusIRNode,
  context: CompilerContext,
): t.Expression {
  switch (node.kind) {
    case 'Text':
      return t.stringLiteral(node.value)

    case 'DynamicText':
      return node.expr

    case 'Element':
      return emitElement(node, context)

    case 'Component':
      return emitComponent(node, context)

    case 'Fragment':
      return emitFragment(node, context)

    case 'Show':
      return emitShow(node, context)

    case 'For':
      return emitFor(node, context)

    case 'Host':
      return emitHost(node, context)

    case 'Slot':
      return emitSlot(node, context)

    default:
      return t.nullLiteral()
  }
}
```

然后 `emitDOM()` 可以改成调用它：

```ts id="k6zy45"
import { emitNodeExpression } from './emitNodeExpression'

export function emitDOM(
  node: ZeusIRNode,
  context: CompilerContext,
): t.Expression {
  return emitNodeExpression(node, context)
}
```

当前 `emitDOM` 已经负责按 IR kind 分发。

---

# 10. `emitComponent.ts` 使用 `emitNodeExpression`

```ts id="79gybw"
import * as t from '@babel/types'

import { emitNodeExpression } from './emitNodeExpression'

import type { CompilerContext } from '../../context'
import type { ComponentIR, ComponentPropIR, ZeusIRNode } from '../../ir/nodes'

export function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('createComponent'), [
    node.callee,
    t.objectExpression(
      node.props.map(prop => emitComponentProp(prop, context)),
    ),
  ])
}

function emitComponentProp(
  prop: ComponentPropIR,
  context: CompilerContext,
): t.ObjectProperty | t.ObjectMethod {
  const key = createObjectKey(prop.name)

  if (Array.isArray(prop.value)) {
    return t.objectProperty(key, emitChildrenProp(prop.value, context))
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

---

# 11. `emitFragment.ts`

如果当前已经有，可以检查是否足够。建议 MVP：

```ts id="tg9kjd"
import * as t from '@babel/types'

import { emitChildrenProp } from './emitComponent'

import type { CompilerContext } from '../../context'
import type { FragmentIR } from '../../ir/nodes'

export function emitFragment(
  node: FragmentIR,
  context: CompilerContext,
): t.Expression {
  return emitChildrenProp(node.children, context)
}
```

Fragment 在 runtime 里就是数组。

---

# 12. `lowerExpression.ts`

Phase 3 要明确 JSX expression 的规则。

建议：

```txt id="sn7wma"
{null}       -> 不渲染
{false}      -> 不渲染
{true}       -> 不渲染
{expr}       -> DynamicTextIR(expr)
{<div />}    -> lowerJSX
{['a', b]}   -> DynamicTextIR(expr)，由 runtime insert 处理数组
```

如果你当前已经是类似逻辑，可以保留。核心是确保：

```tsx id="rg6l7n"
<div>{count.value}</div>
```

会生成 `DynamicTextIR`，后面 `collectTemplates` 会把它变成 `<!>` marker。

---

# 13. `assignDomPaths.ts`

当前 `assignDomPaths` 已经给 `DynamicText / Component / Show / For / Slot` 这些需要 marker 的节点分配 `Marker(parent, index)`，这正好适合 Phase 3。

不需要大改。

但要确认：

```txt id="za6ygy"
RefBinding 不需要 domPath
AttrBinding 不需要 domPath
EventBinding 不需要 domPath
```

它们依赖的是元素自身 `target.ref.name`。

---

# 14. `collectTemplates.ts`

当前逻辑：

```txt id="xivj19"
Element -> registerTemplate(renderTemplateHTML(node))
Fragment -> 注册 fragment 下直接 Element 的 template
DynamicText / Component / Show / For / Slot -> 输出 <!>
```

这是正确方向。

建议补 `className` 静态归一化：

```ts id="uqcnwa"
function normalizeStaticAttrName(name: string): string {
  return name === 'className' ? 'class' : name
}
```

修改：

```ts id="h8ftu7"
function renderStaticAttr(attr: StaticAttributeIR): string {
  const name = normalizeStaticAttrName(attr.name)

  if (attr.value === true) return ` ${name}`

  return ` ${name}="${escapeAttr(attr.value)}"`
}
```

完整片段：

```ts id="5pr16l"
export function renderTemplateHTML(node: ElementIR): string {
  const attrs = node.attrs
    .filter(attr => attr.kind === 'StaticAttribute')
    .map(attr => {
      if (attr.kind !== 'StaticAttribute') return ''

      const name = normalizeStaticAttrName(attr.name)

      if (attr.value === true) return ` ${name}`

      return ` ${name}="${escapeAttr(attr.value)}"`
    })
    .join('')

  if (node.flags.isVoid) {
    return `<${node.tagName}${attrs}>`
  }

  return `<${node.tagName}${attrs}>${node.children
    .map(renderChildTemplate)
    .join('')}</${node.tagName}>`
}

function normalizeStaticAttrName(name: string): string {
  return name === 'className' ? 'class' : name
}
```

---

# 15. `program.ts`

当前 Program visitor 会在 exit 注入：

```txt id="76o5kc"
appendTemplates
appendEvents
appendImportMethods
```

这套可以保留。

但 Phase 3 建议临时关闭 `appendEvents()`，除非 runtime-dom 已经实现 `delegateEvents()`。

因为 `appendEvents()` 会生成：

```ts id="b287fr"
delegateEvents([...])
```

而 Phase 2 如果只是直接 `bindEvent()`，不一定需要它。

两种选择：

## 方案 A：保留 appendEvents，runtime-dom 提供 delegateEvents 空实现

```ts id="o6qbfx"
export function delegateEvents(_events: readonly string[]): void {
  // Phase 3 no-op.
}
```

## 方案 B：Phase 3 暂时不调用 appendEvents

```ts id="v81lng"
function exitProgram(
  config: CompilerOptions,
  path: BabelProgramPath,
  state: BabelState,
): void {
  if (state.get('skip')) return

  appendTemplates(path)
  // appendEvents(path) // Phase 6 再开
  appendImportMethods(path)
}
```

我建议 **方案 A**，因为当前 compiler support 已经有事件注册逻辑，保留路径更少改。

---

# 16. compiler config

当前 config 里有这些选项：

```txt id="d9us1d"
moduleName
generate
hydratable
delegateEvents
delegatedEvents
builtIns
wrapConditionals
staticMarker
effectWrapper
memoWrapper
validate
inlineStyles
```

Phase 3 建议暂时只保证：

```txt id="yvu49c"
moduleName
delegateEvents
builtIns
validate
inlineStyles
```

其中 `moduleName` 很关键，因为 runtime helper import 依赖它。当前默认是 `@zeus-js/runtime-dom`。

---

# 17. 测试实现

你当前已有 `packages/compiler/__tests__/jsx.spec.ts`，里面覆盖了静态元素、动态文本、组件、嵌套组件。

Phase 3 要新增测试。

---

## 17.1 attr/class/style/ref 测试

```ts id="onw8ya"
it('compiles dynamic attr/class/style/ref/event', async () => {
  const code = `
    const App = () => {
      const input = state<HTMLInputElement | null>(null)
      const user = state({
        name: 'Zeus',
        active: true,
        width: 100
      })

      return (
        <input
          ref={input}
          class={{ active: user.active }}
          style={{ width: user.width }}
          title={user.name}
          prop:value={user.name}
          onInput={e => user.name = e.currentTarget.value}
        />
      )
    }
  `

  expect(await compile(code)).toMatchSnapshot()
})
```

期望包含：

```ts id="za13l9"
_bindRef(_el$, input)
_bindClass(_el$, () => ({ active: user.active }))
_bindStyle(_el$, () => ({ width: user.width }))
_bindAttr(_el$, 'title', () => user.name)
_bindProp(_el$, 'value', () => user.name)
_bindEvent(_el$, 'input', e => (user.name = e.currentTarget.value))
```

---

## 17.2 static className 测试

```ts id="tdafh0"
it('normalizes static className to class in template', async () => {
  const code = `
    const App = () => <div className="box">hello</div>
  `

  expect(await compile(code)).toMatchSnapshot()
})
```

期望模板：

```ts id="62dfvs"
_template(`<div class="box">hello</div>`)
```

---

## 17.3 dynamic className 测试

```ts id="43upfe"
it('compiles dynamic className as bindClass', async () => {
  const code = `
    const App = props => <div className={props.className} />
  `

  expect(await compile(code)).toMatchSnapshot()
})
```

期望：

```ts id="ojjg15"
_bindClass(_el$, () => props.className)
```

---

## 17.4 Show fallback 测试

```ts id="xd4f2o"
it('compiles Show with fallback', async () => {
  const code = `
    const App = props => (
      <div>
        <Show when={props.visible} fallback={<span>hidden</span>}>
          <span>visible</span>
        </Show>
      </div>
    )
  `

  expect(await compile(code)).toMatchSnapshot()
})
```

期望包含：

```ts id="hg8aqm"
_mountShow(
  _el$,
  _show$,
  () => props.visible,
  () => ...visible...,
  () => ...hidden...
)
```

---

## 17.5 For 测试

```ts id="yqylbo"
it('compiles For', async () => {
  const code = `
    const App = props => (
      <ul>
        <For each={props.items}>
          {(item, index) => <li>{index}: {item}</li>}
        </For>
      </ul>
    )
  `

  expect(await compile(code)).toMatchSnapshot()
})
```

期望包含：

```ts id="hkktg3"
_mountFor(
  _el$,
  _for$,
  () => props.items,
  (item, index) => ...
)
```

---

## 17.6 component dynamic prop 测试

```ts id="nnzl07"
it('compiles dynamic component props as getters', async () => {
  const code = `
    function Title(props) {
      return <h1>{props.name}</h1>
    }

    const App = () => {
      const user = state({ name: 'Zeus' })
      return <Title name={user.name} />
    }
  `

  expect(await compile(code)).toMatchSnapshot()
})
```

期望：

```ts id="ffo9w4"
_createComponent(Title, {
  get name() {
    return user.name
  },
})
```

---

# 18. Phase 3 任务拆分

## Phase 3.1：runtime helper 对齐

确认 compiler 生成的 helper 在 runtime-dom 中都存在：

```txt id="bvy1o2"
template
child
marker
insert
bindText
bindAttr
bindProp
bindClass
bindStyle
bindEvent
bindRef
createComponent
Show
For
mountShow
mountFor
delegateEvents
```

---

## Phase 3.2：lowerAttribute 完善

```txt id="g07g49"
ref={}
class={}
className={}
style={}
onXxx={}
prop:xxx={}
```

---

## Phase 3.3：emitBinding 完善

```txt id="jqiwkg"
AttrBinding -> bindAttr / bindClass / bindStyle
PropBinding -> bindProp
EventBinding -> bindEvent
RefBinding -> bindRef
```

---

## Phase 3.4：component props getter

```txt id="vdzkm9"
静态 prop -> objectProperty
动态 prop -> getter
children -> objectProperty
```

---

## Phase 3.5：Show / For 稳定

当前 `emitBuiltin.ts` 已经有 `emitShow / emitMountShow / emitFor / emitMountFor`，Phase 3 要补测试并和 runtime 行为对齐。

---

## Phase 3.6：template 收集优化

```txt id="8qsbcy"
className -> class
静态 attr escape
动态节点 marker <!>
template dedupe
```

当前 `CompilerContext.registerTemplate()` 已经有 templateMap，可做 dedupe。

---

## Phase 3.7：snapshot 测试补齐

新增：

```txt id="mg77hl"
attrs.spec.ts
refs.spec.ts
components.spec.ts
builtins.spec.ts
```

或者继续扩展当前 `jsx.spec.ts`。

---

# 19. Phase 3 完成标准

Phase 3 完成后，这段代码应该能完整编译：

```tsx id="z0ucue"
function App() {
  const count = state(0)
  const user = state({
    name: 'Zeus',
    active: true,
    width: 100,
  })

  const input = state<HTMLInputElement | null>(null)

  return (
    <div class={{ active: user.active }} style={{ width: user.width }}>
      <input
        ref={input}
        prop:value={user.name}
        onInput={e => {
          user.name = e.currentTarget.value
        }}
      />

      <button onClick={() => count.value++}>
        {user.name}: {count.value}
      </button>

      <Show when={count.value > 0} fallback={<span>empty</span>}>
        <span>{count.value}</span>
      </Show>

      <For each={[1, 2, 3]}>
        {(item, index) => (
          <span>
            {index}: {item}
          </span>
        )}
      </For>
    </div>
  )
}
```

并生成：

```txt id="zlymzy"
1. 静态 DOM 进入 template()
2. 动态文本进入 bindText()
3. class 对象进入 bindClass()
4. style 对象进入 bindStyle()
5. prop:value 进入 bindProp()
6. onInput 进入 bindEvent()
7. ref 进入 bindRef()
8. Show 进入 mountShow()
9. For 进入 mountFor()
10. 组件 props 动态值使用 getter
```

---

# 20. 最终结论

Phase 3 的核心不是“重新写一个 compiler”，而是把你已经有的这条链路补齐：

```txt id="al0ny6"
JSX AST
  -> lower 成 Zeus IR
  -> passes 分析 DOM path / template
  -> codegen 生成 runtime-dom helper 调用
```

你当前仓库已经有这条主线。Phase 3 的实际落地点是：

```txt id="o7q88p"
1. lowerAttribute 支持 ref/class/style 完整语义
2. emitBinding 对齐 Phase 2 runtime helper
3. emitComponent 支持动态 prop getter
4. collectTemplates 优化静态 attr
5. Show/For 补测试稳定
6. compiler snapshot 覆盖 MVP TSX
```

做完 Phase 3，Zeus 就从“runtime 和 compiler 分别存在”进入真正的 **JSX 编译闭环**。
