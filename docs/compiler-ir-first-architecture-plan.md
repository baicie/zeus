# Zeus Compiler IR-first 架构优化方案

本文档给出 Zeus 编译器当前阶段的最优架构演进方案。

目标不是为了“看起来更分层”而重构，而是为 Zeus 的核心路线服务：

- 编译器优先
- 细粒度更新
- 无 Virtual DOM
- DOM codegen 可优化
- Web Components 可作为一等编译目标
- 未来可以迁移到 Rust compiler backend

当前最佳方向是：将 compiler 从“遍历 JSX 时直接拼 template 和 Babel statement”演进为 **IR-first compiler pipeline**。

---

## 1. 结论

Zeus compiler 应该演进为下面这条流水线：

```txt
Babel JSX AST
  -> lower JSX to Zeus IR
  -> run IR passes
  -> emit DOM Babel AST
  -> inject templates/imports/events
```

对应代码结构：

```txt
packages/compiler/src/
  context/
  lower/
  ir/
  passes/
  codegen/dom/
  codegen/support/
  diagnostics/
```

短期不要一次性推翻现有 compiler，而是采用渐进式迁移：

1. 保留当前 `transform/*` 与快照测试。
2. 新增 IR-first 新链路。
3. 先迁移 native element、text、dynamic text、attr、event、component。
4. 新链路输出与旧快照一致或更正确后，再删除旧的 `TransformResults` 拼装路径。

---

## 2. 当前架构的问题

当前 compiler 已有良好起点：

- `packages/compiler/src/transform/*` 已能处理 JSX。
- `packages/compiler/src/ir/*` 已有 IR 雏形。
- `packages/compiler/src/codegen/support/*` 已有 imports/templates/events 注册逻辑。
- `packages/compiler/__tests__/jsx.spec.ts` 已有快照测试。

但核心问题是：**IR 尚未成为真正的 compiler 内部协议**。

### 2.1 transform 层承担过多职责

例如 `transformChildren` 当前同时承担：

- JSX children 过滤
- child transform 调度
- template 字符串拼接
- 子节点 DOM 定位
- runtime helper 调用生成
- Babel statement 拼接

这会导致一个问题：当动态文本、Fragment、Show、For、Host、Slot 进入后，每个 transform 都要理解 DOM 定位和 codegen 细节。

### 2.2 Babel AST 过早泄漏到中间结果

当前 `ElementTransformResults` 中有：

```ts
declarations: BabelStatement[]
exprs: BabelStatement[]
dynamics: BabelStatement[]
postExprs: BabelStatement[]
```

这意味着 lower JSX 时已经开始生成最终 JS statement。这样会让后续优化 pass 很难写，因为 pass 看到的不是“Zeus 视图语义”，而是一堆 Babel statement。

### 2.3 DOM 定位缺少全局 pass

现在 DOM 定位是在 children transform 中局部完成的，例如：

```ts
parent.firstChild
previousSibling.nextSibling
```

这对简单元素可用，但遇到以下情况会变脆：

- 静态 text 与 element 混排
- dynamic text 在中间
- Fragment
- Show / For 区域锚点
- Web Components 的 Host / Slot
- SVG namespace

最优方案是：把 DOM 定位变成独立 pass：`assignDomPaths`。

### 2.4 helper 注册应属于 codegen

`insert`、`template`、`setAttr`、`bindText`、`bindEvent` 的 import 注册不应该发生在 lowering 阶段。

lower 阶段应该只说：

```txt
这里有一个 DynamicText
这里有一个 EventBinding
这里有一个 AttrBinding
```

codegen 阶段再决定使用哪些 runtime helper。

---

## 3. 最优目标架构

### 3.1 目录结构

建议目标结构：

```txt
packages/compiler/src/
  index.ts
  visitor.ts
  program.ts

  context/
    CompilerContext.ts
    symbols.ts
    index.ts

  parse/
    jsx.ts

  lower/
    lowerJSX.ts
    lowerElement.ts
    lowerText.ts
    lowerExpression.ts
    lowerAttribute.ts
    lowerComponent.ts
    lowerFragment.ts
    lowerBuiltin.ts
    index.ts

  ir/
    nodes.ts
    builders.ts
    visit.ts
    assert.ts
    index.ts

  passes/
    normalizeChildren.ts
    validateBuiltins.ts
    assignDomPaths.ts
    collectTemplates.ts
    analyzeBindings.ts
    index.ts

  codegen/
    dom/
      emitProgram.ts
      emitNode.ts
      emitElement.ts
      emitTemplate.ts
      emitBinding.ts
      emitComponent.ts
      emitFragment.ts
      index.ts
    support/
      imports.ts
      templates.ts
      events.ts
      index.ts

  diagnostics/
    codes.ts
    CompilerError.ts
    index.ts
```

### 3.2 模块职责

#### `context`

保存单次编译过程中的共享状态：

- options
- import registry
- template registry
- symbol 生成
- diagnostics
- filename

#### `lower`

只负责把 Babel JSX AST 转成 Zeus IR。

它不应该：

- 注册 runtime import
- 拼接最终 Babel statement
- 生成 `template(...)`
- 计算复杂 DOM path

#### `ir`

定义 Zeus compiler 的长期内部协议。

IR 应表达：

- 模板结构
- 动态绑定
- DOM 节点引用
- 控制流
- 组件边界
- Web Components 内置节点

#### `passes`

负责分析和规范化 IR。

例如：

- normalize children
- assign DOM path
- collect template
- validate Host / Slot
- analyze binding kind

#### `codegen/dom`

只负责把 IR 变成 Babel AST。

例如：

- `_template(...)`
- `_bindText(...)`
- `_bindAttr(...)`
- `_bindEvent(...)`
- `_createComponent(...)`

---

## 4. CompilerContext 代码草案

```ts
// packages/compiler/src/context/CompilerContext.ts

import type * as t from '@babel/types'
import type { NodePath } from '@babel/core'
import type { CompilerOptions } from '../config'

export type RuntimeImportRecord = {
  moduleName: string
  imported: string
  local: t.Identifier
}

export type TemplateRecord = {
  id: t.Identifier
  html: string
  isSVG: boolean
}

export type CompilerDiagnostic = {
  code: string
  message: string
  path?: NodePath
  hint?: string
}

export class CompilerContext {
  readonly imports = new Map<string, RuntimeImportRecord>()
  readonly templates = new Map<string, TemplateRecord>()
  readonly diagnostics: CompilerDiagnostic[] = []

  constructor(
    readonly options: CompilerOptions,
    readonly programPath: NodePath<t.Program>,
  ) {}

  runtimeModule(): string {
    return this.options.moduleName || '@zeus-js/runtime-dom'
  }

  uid(name: string): t.Identifier {
    return this.programPath.scope.generateUidIdentifier(name)
  }

  importRuntime(imported: string): t.Identifier {
    const moduleName = this.runtimeModule()
    const key = `${moduleName}:${imported}`
    const cached = this.imports.get(key)

    if (cached) return t.cloneNode(cached.local)

    const local = this.uid(imported)

    this.imports.set(key, {
      moduleName,
      imported,
      local,
    })

    return t.cloneNode(local)
  }

  registerTemplate(html: string, isSVG = false): TemplateRecord {
    const cached = this.templates.get(html)
    if (cached) return cached

    const record: TemplateRecord = {
      id: this.uid('tmpl$'),
      html,
      isSVG,
    }

    this.templates.set(html, record)
    return record
  }

  report(diagnostic: CompilerDiagnostic): void {
    this.diagnostics.push(diagnostic)
  }
}
```

---

## 5. IR 类型代码草案

```ts
// packages/compiler/src/ir/nodes.ts

import type * as t from '@babel/types'

export type IRRef = {
  name: string
}

export type DomPath =
  | { kind: 'Root' }
  | { kind: 'FirstChild'; parent: IRRef }
  | { kind: 'NextSibling'; previous: IRRef }
  | { kind: 'Marker'; parent: IRRef; index: number }

export type BaseIRNode = {
  id: number
  loc?: t.SourceLocation | null
}

export type ProgramIR = BaseIRNode & {
  kind: 'Program'
  body: ZeusIRNode[]
}

export type ElementIR = BaseIRNode & {
  kind: 'Element'
  ref: IRRef
  tagName: string
  attrs: AttributeIR[]
  children: ZeusIRNode[]
  domPath?: DomPath
  flags: {
    isSVG: boolean
    isVoid: boolean
    isCustomElement: boolean
  }
}

export type TextIR = BaseIRNode & {
  kind: 'Text'
  value: string
}

export type DynamicTextIR = BaseIRNode & {
  kind: 'DynamicText'
  expr: t.Expression
  ref: IRRef
  domPath?: DomPath
}

export type StaticAttributeIR = BaseIRNode & {
  kind: 'StaticAttribute'
  name: string
  value: string | true
}

export type AttrBindingIR = BaseIRNode & {
  kind: 'AttrBinding'
  name: string
  expr: t.Expression
}

export type PropBindingIR = BaseIRNode & {
  kind: 'PropBinding'
  name: string
  expr: t.Expression
}

export type EventBindingIR = BaseIRNode & {
  kind: 'EventBinding'
  eventName: string
  handler: t.Expression
}

export type AttributeIR =
  | StaticAttributeIR
  | AttrBindingIR
  | PropBindingIR
  | EventBindingIR

export type ComponentIR = BaseIRNode & {
  kind: 'Component'
  ref: IRRef
  callee: t.Expression
  props: ComponentPropIR[]
}

export type ComponentPropIR = {
  name: string
  value: t.Expression
}

export type FragmentIR = BaseIRNode & {
  kind: 'Fragment'
  children: ZeusIRNode[]
}

export type ShowIR = BaseIRNode & {
  kind: 'Show'
  when: t.Expression
  children: ZeusIRNode[]
  fallback?: ZeusIRNode[]
}

export type ForIR = BaseIRNode & {
  kind: 'For'
  each: t.Expression
  item: t.Identifier
  index?: t.Identifier
  body: ZeusIRNode[]
}

export type HostIR = BaseIRNode & {
  kind: 'Host'
  children: ZeusIRNode[]
}

export type SlotIR = BaseIRNode & {
  kind: 'Slot'
  name?: string
  fallback: ZeusIRNode[]
}

export type ZeusIRNode =
  | ElementIR
  | TextIR
  | DynamicTextIR
  | ComponentIR
  | FragmentIR
  | ShowIR
  | ForIR
  | HostIR
  | SlotIR
```

---

## 6. IR Builder 代码草案

```ts
// packages/compiler/src/ir/builders.ts

import type * as t from '@babel/types'
import type {
  AttrBindingIR,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
  IRRef,
  StaticAttributeIR,
  TextIR,
  ZeusIRNode,
} from './nodes'

let nextId = 0

function id(): number {
  return nextId++
}

export function ref(name: string): IRRef {
  return { name }
}

export function elementIR(input: {
  ref: IRRef
  tagName: string
  attrs?: ElementIR['attrs']
  children?: ZeusIRNode[]
  flags?: Partial<ElementIR['flags']>
}): ElementIR {
  return {
    id: id(),
    kind: 'Element',
    ref: input.ref,
    tagName: input.tagName,
    attrs: input.attrs ?? [],
    children: input.children ?? [],
    flags: {
      isSVG: false,
      isVoid: false,
      isCustomElement: input.tagName.includes('-'),
      ...input.flags,
    },
  }
}

export function textIR(value: string): TextIR {
  return {
    id: id(),
    kind: 'Text',
    value,
  }
}

export function dynamicTextIR(expr: t.Expression, nodeRef: IRRef): DynamicTextIR {
  return {
    id: id(),
    kind: 'DynamicText',
    expr,
    ref: nodeRef,
  }
}

export function staticAttrIR(
  name: string,
  value: string | true,
): StaticAttributeIR {
  return {
    id: id(),
    kind: 'StaticAttribute',
    name,
    value,
  }
}

export function attrBindingIR(
  name: string,
  expr: t.Expression,
): AttrBindingIR {
  return {
    id: id(),
    kind: 'AttrBinding',
    name,
    expr,
  }
}

export function eventBindingIR(
  eventName: string,
  handler: t.Expression,
): EventBindingIR {
  return {
    id: id(),
    kind: 'EventBinding',
    eventName,
    handler,
  }
}

export function componentIR(input: {
  ref: IRRef
  callee: t.Expression
  props: ComponentIR['props']
}): ComponentIR {
  return {
    id: id(),
    kind: 'Component',
    ref: input.ref,
    callee: input.callee,
    props: input.props,
  }
}
```

---

## 7. Lower 阶段代码草案

### 7.1 lowerJSX

```ts
// packages/compiler/src/lower/lowerJSX.ts

import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { CompilerContext } from '../context'
import type { ZeusIRNode } from '../ir'
import { lowerElement } from './lowerElement'
import { lowerFragment } from './lowerFragment'

export function lowerJSX(
  path: NodePath<t.JSXElement | t.JSXFragment>,
  context: CompilerContext,
): ZeusIRNode {
  if (path.isJSXElement()) {
    return lowerElement(path, context)
  }

  if (path.isJSXFragment()) {
    return lowerFragment(path, context)
  }

  throw new Error('Unsupported JSX node')
}
```

### 7.2 lowerElement

```ts
// packages/compiler/src/lower/lowerElement.ts

import * as t from '@babel/types'
import type { NodePath } from '@babel/core'
import type { CompilerContext } from '../context'
import {
  componentIR,
  elementIR,
  ref,
  type ElementIR,
  type ZeusIRNode,
} from '../ir'
import { getTagName, isComponentTag } from '../parse/jsx'
import { VoidElements } from '../utils'
import { lowerAttribute } from './lowerAttribute'
import { lowerChildren } from './lowerChildren'

export function lowerElement(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const tagName = getTagName(path.node)

  if (isComponentTag(tagName)) {
    return componentIR({
      ref: ref(context.uid('cmp$').name),
      callee: t.identifier(tagName),
      props: [],
    })
  }

  const attrs = path
    .get('openingElement')
    .get('attributes')
    .map(attr => lowerAttribute(attr, context))
    .filter(Boolean) as ElementIR['attrs']

  return elementIR({
    ref: ref(context.uid('el$').name),
    tagName,
    attrs,
    children: VoidElements.includes(tagName)
      ? []
      : lowerChildren(path.get('children'), context),
    flags: {
      isVoid: VoidElements.includes(tagName),
      isCustomElement: tagName.includes('-'),
    },
  })
}
```

### 7.3 lowerChildren

```ts
// packages/compiler/src/lower/lowerChildren.ts

import * as t from '@babel/types'
import type { NodePath } from '@babel/core'
import type { CompilerContext } from '../context'
import {
  dynamicTextIR,
  ref,
  textIR,
  type ZeusIRNode,
} from '../ir'
import { escapeHTML, trimJSXText } from '../utils/html'
import { lowerJSX } from './lowerJSX'

export function lowerChildren(
  children: NodePath<t.JSXElement['children'][number]>[],
  context: CompilerContext,
): ZeusIRNode[] {
  const result: ZeusIRNode[] = []

  for (const child of children) {
    if (child.isJSXText()) {
      const text = trimJSXText(child.node.value)
      if (text) result.push(textIR(escapeHTML(text)))
      continue
    }

    if (child.isJSXExpressionContainer()) {
      const expr = child.node.expression
      if (t.isJSXEmptyExpression(expr)) continue

      if (t.isExpression(expr)) {
        result.push(dynamicTextIR(expr, ref(context.uid('text$').name)))
      }

      continue
    }

    if (child.isJSXElement() || child.isJSXFragment()) {
      result.push(lowerJSX(child, context))
      continue
    }
  }

  return result
}
```

### 7.4 lowerAttribute

```ts
// packages/compiler/src/lower/lowerAttribute.ts

import * as t from '@babel/types'
import type { NodePath } from '@babel/core'
import type { CompilerContext } from '../context'
import {
  attrBindingIR,
  eventBindingIR,
  staticAttrIR,
  type AttributeIR,
} from '../ir'
import { CompilerError, CompilerErrorCode } from '../diagnostics'
import { getJSXAttrName, toEventName } from '../parse/jsx'

export function lowerAttribute(
  path: NodePath<t.JSXAttribute | t.JSXSpreadAttribute>,
  context: CompilerContext,
): AttributeIR | null {
  if (path.isJSXSpreadAttribute()) {
    throw new CompilerError({
      code: CompilerErrorCode.UNSUPPORTED_SPREAD_ATTRIBUTE,
      message: 'Spread attributes are not supported in Zeus MVP.',
      path,
      hint: 'Use explicit attributes instead, for example <div id={id} />.',
    })
  }

  const name = getJSXAttrName(path.node.name)
  const value = path.node.value

  if (!value) {
    return staticAttrIR(name, true)
  }

  if (t.isStringLiteral(value)) {
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

    if (name.startsWith('on') && name.length > 2) {
      return eventBindingIR(toEventName(name), expr)
    }

    return attrBindingIR(name, expr)
  }

  return null
}
```

---

## 8. Pass 代码草案

### 8.1 assignDomPaths

这是最重要的 pass。

职责：

- 给静态 element 分配 DOM path。
- 给 dynamic text 分配 marker 或 placeholder。
- 不在 lowering 阶段计算 DOM sibling。

```ts
// packages/compiler/src/passes/assignDomPaths.ts

import type {
  DomPath,
  DynamicTextIR,
  ElementIR,
  IRRef,
  ZeusIRNode,
} from '../ir'

export function assignDomPaths(node: ZeusIRNode): ZeusIRNode {
  visitNode(node, undefined)
  return node
}

function visitNode(node: ZeusIRNode, parent?: ElementIR): void {
  switch (node.kind) {
    case 'Element':
      assignElementPath(node, parent)
      assignChildPaths(node)
      return

    case 'Fragment':
      for (const child of node.children) {
        visitNode(child, parent)
      }
      return

    case 'Component':
    case 'Text':
    case 'DynamicText':
    case 'Show':
    case 'For':
    case 'Host':
    case 'Slot':
      return
  }
}

function assignElementPath(node: ElementIR, parent?: ElementIR): void {
  if (!parent) {
    node.domPath = { kind: 'Root' }
    return
  }

  const staticChildren = parent.children.filter(isStaticTemplateNode)
  const index = staticChildren.indexOf(node)

  if (index === 0) {
    node.domPath = { kind: 'FirstChild', parent: parent.ref }
    return
  }

  const previous = staticChildren[index - 1] as ElementIR
  node.domPath = { kind: 'NextSibling', previous: previous.ref }
}

function assignChildPaths(parent: ElementIR): void {
  let markerIndex = 0

  for (const child of parent.children) {
    if (child.kind === 'DynamicText') {
      assignDynamicTextPath(child, parent.ref, markerIndex++)
      continue
    }

    visitNode(child, parent)
  }
}

function assignDynamicTextPath(
  node: DynamicTextIR,
  parent: IRRef,
  index: number,
): void {
  node.domPath = {
    kind: 'Marker',
    parent,
    index,
  }
}

function isStaticTemplateNode(node: ZeusIRNode): node is ElementIR {
  return node.kind === 'Element'
}
```

### 8.2 collectTemplates

职责：

- 从 IR 生成 template HTML。
- 动态点位用 marker 占位。
- 静态 attr inline 到 template。
- 动态 attr/event 不进入 template。

```ts
// packages/compiler/src/passes/collectTemplates.ts

import type { CompilerContext } from '../context'
import type { ElementIR, ZeusIRNode } from '../ir'

export function collectTemplates(
  node: ZeusIRNode,
  context: CompilerContext,
): void {
  if (node.kind === 'Element') {
    const html = renderTemplateHTML(node)
    context.registerTemplate(html, node.flags.isSVG)
  }
}

export function renderTemplateHTML(node: ElementIR): string {
  const attrs = node.attrs
    .filter(attr => attr.kind === 'StaticAttribute')
    .map(attr => {
      if (attr.kind !== 'StaticAttribute') return ''
      if (attr.value === true) return ` ${attr.name}`
      return ` ${attr.name}="${escapeAttr(attr.value)}"`
    })
    .join('')

  if (node.flags.isVoid) {
    return `<${node.tagName}${attrs}>`
  }

  return `<${node.tagName}${attrs}>${node.children
    .map(renderChildTemplate)
    .join('')}</${node.tagName}>`
}

function renderChildTemplate(node: ZeusIRNode): string {
  switch (node.kind) {
    case 'Element':
      return renderTemplateHTML(node)
    case 'Text':
      return node.value
    case 'DynamicText':
      return '<!>'
    case 'Fragment':
      return node.children.map(renderChildTemplate).join('')
    default:
      return '<!>'
  }
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
}
```

### 8.3 validateBuiltins

职责：

- `Host` 只能在 `defineElement` render root。
- `Slot` 只能出现在 `Host` 子树内。
- `Show` / `For` 是编译期内置节点，不应当走普通 component。

```ts
// packages/compiler/src/passes/validateBuiltins.ts

import { CompilerError, CompilerErrorCode } from '../diagnostics'
import type { ZeusIRNode } from '../ir'

export function validateBuiltins(node: ZeusIRNode): void {
  visit(node, {
    insideHost: false,
  })
}

type ValidateState = {
  insideHost: boolean
}

function visit(node: ZeusIRNode, state: ValidateState): void {
  switch (node.kind) {
    case 'Host':
      for (const child of node.children) {
        visit(child, { insideHost: true })
      }
      return

    case 'Slot':
      if (!state.insideHost) {
        throw new CompilerError({
          code: CompilerErrorCode.INVALID_BUILTIN_USAGE,
          message: '<Slot> can only be used inside <Host>.',
        })
      }
      return

    case 'Element':
    case 'Fragment':
      for (const child of node.children) {
        visit(child, state)
      }
      return

    default:
      return
  }
}
```

---

## 9. DOM Codegen 代码草案

### 9.1 emitDOM

```ts
// packages/compiler/src/codegen/dom/index.ts

import * as t from '@babel/types'
import type { CompilerContext } from '../../context'
import type { ZeusIRNode } from '../../ir'
import { emitElement } from './emitElement'
import { emitFragment } from './emitFragment'
import { emitComponent } from './emitComponent'

export function emitDOM(
  node: ZeusIRNode,
  context: CompilerContext,
): t.Expression {
  switch (node.kind) {
    case 'Element':
      return emitElement(node, context)
    case 'Fragment':
      return emitFragment(node, context)
    case 'Component':
      return emitComponent(node, context)
    default:
      throw new Error(`Unsupported root IR node: ${node.kind}`)
  }
}
```

### 9.2 emitElement

```ts
// packages/compiler/src/codegen/dom/emitElement.ts

import * as t from '@babel/types'
import type { CompilerContext } from '../../context'
import type { ElementIR } from '../../ir'
import { renderTemplateHTML } from '../../passes/collectTemplates'
import { emitBindings } from './emitBinding'
import { emitDomPath } from './emitDomPath'

export function emitElement(
  node: ElementIR,
  context: CompilerContext,
): t.Expression {
  const html = renderTemplateHTML(node)
  const template = context.registerTemplate(html, node.flags.isSVG)
  const templateCall = t.callExpression(t.cloneNode(template.id), [])

  const rootDecl = t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(node.ref.name),
      t.memberExpression(templateCall, t.identifier('firstChild')),
    ),
  ])

  const statements: t.Statement[] = [rootDecl]

  for (const child of node.children) {
    if (child.kind === 'Element') {
      statements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(child.ref.name),
            emitDomPath(child.domPath!, context),
          ),
        ]),
      )
    }
  }

  statements.push(...emitBindings(node, context))
  statements.push(t.returnStatement(t.identifier(node.ref.name)))

  return t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement(statements)),
    [],
  )
}
```

### 9.3 emitDomPath

```ts
// packages/compiler/src/codegen/dom/emitDomPath.ts

import * as t from '@babel/types'
import type { CompilerContext } from '../../context'
import type { DomPath } from '../../ir'

export function emitDomPath(
  path: DomPath,
  context: CompilerContext,
): t.Expression {
  switch (path.kind) {
    case 'Root':
      throw new Error('Root path is emitted from template clone directly')

    case 'FirstChild':
      return t.memberExpression(
        t.identifier(path.parent.name),
        t.identifier('firstChild'),
      )

    case 'NextSibling':
      return t.memberExpression(
        t.identifier(path.previous.name),
        t.identifier('nextSibling'),
      )

    case 'Marker': {
      const marker = context.importRuntime('marker')
      return t.callExpression(marker, [
        t.identifier(path.parent.name),
        t.numericLiteral(path.index),
      ])
    }
  }
}
```

### 9.4 emitBinding

```ts
// packages/compiler/src/codegen/dom/emitBinding.ts

import * as t from '@babel/types'
import type { CompilerContext } from '../../context'
import type {
  AttrBindingIR,
  DynamicTextIR,
  ElementIR,
  EventBindingIR,
} from '../../ir'
import { emitDomPath } from './emitDomPath'

export function emitBindings(
  node: ElementIR,
  context: CompilerContext,
): t.Statement[] {
  const statements: t.Statement[] = []

  for (const attr of node.attrs) {
    if (attr.kind === 'AttrBinding') {
      statements.push(emitAttrBinding(node, attr, context))
    }

    if (attr.kind === 'EventBinding') {
      statements.push(emitEventBinding(node, attr, context))
    }
  }

  for (const child of node.children) {
    if (child.kind === 'DynamicText') {
      statements.push(...emitDynamicText(child, context))
    }

    if (child.kind === 'Element') {
      statements.push(...emitBindings(child, context))
    }
  }

  return statements
}

function emitAttrBinding(
  target: ElementIR,
  binding: AttrBindingIR,
  context: CompilerContext,
): t.Statement {
  const bindAttr = context.importRuntime('bindAttr')

  return t.expressionStatement(
    t.callExpression(bindAttr, [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.name),
      t.arrowFunctionExpression([], binding.expr),
    ]),
  )
}

function emitEventBinding(
  target: ElementIR,
  binding: EventBindingIR,
  context: CompilerContext,
): t.Statement {
  const bindEvent = context.importRuntime('bindEvent')

  return t.expressionStatement(
    t.callExpression(bindEvent, [
      t.identifier(target.ref.name),
      t.stringLiteral(binding.eventName),
      binding.handler,
    ]),
  )
}

function emitDynamicText(
  node: DynamicTextIR,
  context: CompilerContext,
): t.Statement[] {
  const bindText = context.importRuntime('bindText')
  const insert = context.importRuntime('insert')
  const markerExpr = emitDomPath(node.domPath!, context)

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier(node.ref.name), markerExpr),
    ]),
    t.expressionStatement(
      t.callExpression(insert, [
        t.identifier(node.ref.name),
        t.callExpression(
          t.memberExpression(
            t.identifier('document'),
            t.identifier('createTextNode'),
          ),
          [t.stringLiteral('')],
        ),
      ]),
    ),
    t.expressionStatement(
      t.callExpression(bindText, [
        t.identifier(node.ref.name),
        t.arrowFunctionExpression([], node.expr),
      ]),
    ),
  ]
}
```

上面 `emitDynamicText` 是草案，实际更推荐将 marker ref 与 text ref 分开：

```txt
marker: _marker$
text: _text$
```

正式实现时应输出：

```ts
const _marker$ = _marker(_el$, 0)
const _text$ = document.createTextNode('')
_insert(_el$, _text$, _marker$)
_bindText(_text$, () => expr)
```

---

## 10. Runtime helper 目标配套

为了支持 IR-first codegen，`runtime-dom` 至少需要以下 helper：

```ts
export function template<T extends Node = Node>(html: string): () => T

export function insert(
  parent: Node,
  value: JSXValue,
  marker?: Node | null,
): void

export function marker(parent: ParentNode, index: number): Comment

export function bindText(node: Text, value: () => JSXValue): void

export function bindAttr(
  el: Element,
  name: string,
  value: () => AttrValue,
): void

export function bindEvent<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  name: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void
```

其中 marker 草案：

```ts
export function marker(parent: ParentNode, index: number): Comment {
  let seen = 0
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_COMMENT)

  while (walker.nextNode()) {
    const node = walker.currentNode as Comment

    if (node.data === '' || node.data === '!') {
      if (seen === index) return node
      seen++
    }
  }

  throw new Error(`[Zeus runtime] marker ${index} not found`)
}
```

---

## 11. 新旧架构迁移计划

### Phase 1：引入新 IR 类型，不接主流程

新增：

```txt
ir/nodes.ts
ir/builders.ts
ir/visit.ts
context/CompilerContext.ts
```

验收：

- `pnpm check` 通过。
- 不影响现有快照。

### Phase 2：新增 lower，不替换旧 transform

新增：

```txt
lower/lowerJSX.ts
lower/lowerElement.ts
lower/lowerChildren.ts
lower/lowerAttribute.ts
```

新增测试：

```txt
packages/compiler/__tests__/lower.spec.ts
```

测试 lower 输出结构，不测最终代码。

### Phase 3：新增 passes

新增：

```txt
passes/assignDomPaths.ts
passes/collectTemplates.ts
passes/validateBuiltins.ts
```

测试：

- `<div>{a}<span /></div>`
- `<div><span />{a}<b /></div>`
- `<div>{a}{b}<span /></div>`

验收：

- DOM path 与 marker index 正确。

### Phase 4：新增 DOM codegen

新增：

```txt
codegen/dom/emitElement.ts
codegen/dom/emitBinding.ts
codegen/dom/emitDomPath.ts
```

第一批只覆盖：

- static element
- static text
- dynamic text
- static attr
- dynamic attr
- event attr

### Phase 5：接入主 visitor

在 `transformJSX` 中增加 feature flag：

```ts
if (config.irPipeline) {
  const ir = lowerJSX(path, context)
  runPasses(ir, context)
  path.replaceWith(emitDOM(ir, context))
  return
}
```

默认可以先不开启，避免影响现有链路。

### Phase 6：替换旧 TransformResults

当新链路覆盖所有现有快照后：

- 删除 `TransformResults` 中的 Babel statement 拼装字段。
- 删除旧 `transformChildren` 的 DOM path 逻辑。
- 保留 parse/utils/diagnostics/support 中可复用代码。

---

## 12. 最小主流程最终代码形态

```ts
// packages/compiler/src/transform/index.ts

import { lowerJSX } from '../lower'
import { assignDomPaths, collectTemplates, validateBuiltins } from '../passes'
import { emitDOM } from '../codegen/dom'
import { getCompilerContext } from '../context'

import type { BabelJSXPath, BabelState } from '../types'

export function transformJSX(path: BabelJSXPath, state: BabelState): void {
  if (!path.isJSXElement() && !path.isJSXFragment()) return

  const context = getCompilerContext(path, state)

  const ir = lowerJSX(path, context)

  validateBuiltins(ir)
  assignDomPaths(ir)
  collectTemplates(ir, context)

  path.replaceWith(emitDOM(ir, context))
}
```

---

## 13. 测试策略

### 13.1 lower 测试

验证 JSX 到 IR：

```tsx
<button onClick={fn}>{count()}</button>
```

期望 IR：

```txt
Element(button)
  EventBinding(click)
  DynamicText(count())
```

### 13.2 pass 测试

验证 DOM path：

```tsx
<div><span />{name}<b /></div>
```

期望：

```txt
div: Root
span: FirstChild(div)
b: NextSibling(span)
dynamic name: Marker(div, 0)
```

### 13.3 codegen 快照测试

继续保留当前 `jsx.spec.ts`。

新增覆盖：

- dynamic text in middle
- event binding
- dynamic attr
- boolean attr
- nested element binding

### 13.4 runtime integration 测试

最终需要 jsdom 运行测试：

```tsx
function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <button onClick={() => setCount(count() + 1)}>
      {count()}
    </button>
  )
}
```

验收：

- 初始文本为 `0`
- click 后文本为 `1`
- 组件函数没有重新执行

---

## 14. 为什么这是当前最优方案

### 14.1 符合 Zeus 产品方向

Zeus 明确不是 Virtual DOM 框架。IR-first 架构让 compiler 可以直接描述 DOM 创建、绑定、控制流和 Web Components 语义。

### 14.2 支持未来 Rust 后端

如果现在继续让 Babel AST 成为隐式内部协议，将来迁移 Rust 时会非常痛苦。

IR-first 让未来 Rust compiler 可以复用同一套概念：

```txt
TSX AST -> Zeus IR -> pass -> JS codegen
```

### 14.3 让 Show / For / Host / Slot 有正确位置

这些都不是普通 runtime component。它们应该在 lowering 或 validate pass 中被识别，在 codegen 中生成区域锚点、slot 或 host 边界。

### 14.4 让 DOM 定位变成可测试能力

当前 DOM 定位混在 `transformChildren` 里，测试只能通过最终快照间接发现问题。

拆成 `assignDomPaths` 后，可以直接测试：

```txt
输入 IR -> 输出 DOM path
```

这对后续复杂模板非常关键。

### 14.5 渐进迁移风险最低

该方案不要求一次性重写 compiler。

可以让旧链路继续服务当前功能，同时逐步把能力迁到新链路。每迁一类节点，就用现有快照兜底。

---

## 15. 不建议的方案

### 15.1 不建议继续扩展当前 TransformResults

继续往 `declarations/exprs/dynamics/postExprs` 中塞逻辑，会让每个 transform 都越来越懂 codegen。

短期快，长期会阻塞 Show / For / Web Components。

### 15.2 不建议现在直接按 Solid/dom-expressions 全量复刻

Solid 的实现非常成熟，但 Zeus 的目标包含更明确的 IR、Web Components、未来 Rust 后端。直接复刻会把 Zeus 锁进别人的内部模型。

### 15.3 不建议直接上 Rust compiler

当前语义还没稳定。应该先在 TypeScript/Babel 中把 IR、pass、codegen 跑通，再迁移后端。

### 15.4 不建议做通用 runtime createElement

这会把 Zeus 拉回 runtime interpretation 或 VNode-like 方向，违背 compiler-first 和 no Virtual DOM 的项目原则。

---

## 16. 最终验收标准

架构优化完成后，下面输入：

```tsx
function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <button class="counter" onClick={() => setCount(count() + 1)}>
      count: {count()}
    </button>
  )
}
```

应编译为概念上等价的代码：

```ts
import {
  bindEvent as _bindEvent,
  bindText as _bindText,
  insert as _insert,
  marker as _marker,
  template as _template,
} from '@zeus-js/runtime-dom'

var _tmpl$ = /*#__PURE__*/ _template(
  `<button class="counter">count: <!></button>`,
)

function Counter() {
  const [count, setCount] = createSignal(0)

  return (() => {
    const _el$ = _tmpl$().firstChild
    const _marker$ = _marker(_el$, 0)
    const _text$ = document.createTextNode('')

    _insert(_el$, _text$, _marker$)
    _bindText(_text$, () => count())
    _bindEvent(_el$, 'click', () => setCount(count() + 1))

    return _el$
  })()
}
```

并满足：

- 组件函数只初始化一次。
- 点击后只更新 text node。
- 没有 VNode。
- 动态绑定点由 IR 显式表达。
- DOM path 可独立测试。
- runtime helper import 由 codegen 统一注册。
- 后续 `Show` / `For` / `Host` / `Slot` 可以作为 IR 节点自然接入。

---

## 17. 推荐下一步

下一步最应该落地的是：

```txt
Phase 1 + Phase 2
```

也就是：

1. 新增 `context/CompilerContext.ts`
2. 新增 `ir/nodes.ts`
3. 新增 `ir/builders.ts`
4. 新增 `lower/*`
5. 写 `lower.spec.ts`

不要一开始就替换现有 transform。先让新 IR 链路在测试里跑通，再逐步接入主编译流程。

这是当前 Zeus compiler 最稳、最利于长期演进的优化路径。
