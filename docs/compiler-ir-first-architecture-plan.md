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

export function dynamicTextIR(
  expr: t.Expression,
  nodeRef: IRRef,
): DynamicTextIR {
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

export function attrBindingIR(name: string, expr: t.Expression): AttrBindingIR {
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
import { dynamicTextIR, ref, textIR, type ZeusIRNode } from '../ir'
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
<div>
  <span />
  {name}
  <b />
</div>
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

  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
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

---

## 18. 需要补充考虑的关键问题

上面的 IR-first 方案是主干，但还有一些必须提前纳入设计的问题。它们不一定都要在 Phase 1 实现，但应该进入 IR、pass、codegen 的设计约束，否则后续做 `Show` / `For` / Web Components 时会返工。

### 18.1 Owner / Scope / Cleanup 必须进入 codegen 设计

Zeus 的响应式语义不是“创建 effect 就结束”，而是必须支持作用域释放。

这些场景都依赖 cleanup：

- `Show` 分支卸载
- `For` item 删除
- component 子树释放
- custom element `disconnectedCallback`
- event listener 移除
- ref cleanup

因此 IR 和 codegen 需要表达“哪些节点会创建独立 owner scope”。

建议新增 IR：

```ts
export type ScopeBoundaryIR = BaseIRNode & {
  kind: 'ScopeBoundary'
  ref: IRRef
  children: ZeusIRNode[]
  reason: 'Component' | 'Show' | 'ForItem' | 'CustomElement'
}
```

或者在已有节点上加字段：

```ts
type ScopePolicy = 'inherit' | 'create'

type BaseIRNode = {
  id: number
  loc?: t.SourceLocation | null
  scope?: ScopePolicy
}
```

runtime-dom 最终需要类似 helper：

```ts
export function createDOMScope<T>(fn: (dispose: () => void) => T): T

export function disposeNode(node: Node): void
```

codegen 目标形态：

```ts
const _dispose$ = _createDOMScope(() => {
  _bindText(_text$, () => count())
  _bindEvent(_button$, 'click', onClick)
})
```

短期可以不实现完整 `disposeNode`，但 `Show` / `For` 之前必须补齐。

### 18.2 表达式不能都当 DynamicText

当前草案中 JSX expression 暂时 lower 成 `DynamicTextIR`，这是 MVP 简化，但长期不够。

JSX 表达式可能是：

```tsx
{
  count()
}
{
  props.children
}
{
  condition() ? <A /> : <B />
}
{
  items().map(item => <li>{item.name}</li>)
}
{
  nodeRef()
}
```

这些不全是文本。

建议新增表达式分类：

```ts
export type DynamicExpressionIR = BaseIRNode & {
  kind: 'DynamicExpression'
  expr: t.Expression
  ref: IRRef
  domPath?: DomPath
  expected: 'text' | 'node' | 'mixed'
}
```

lower 阶段先保守标记：

```ts
expected: 'mixed'
```

analyze pass 可以在确定安全时降级：

```txt
DynamicExpression(mixed)
  -> DynamicText(text)
  -> DynamicNode(node)
  -> DynamicRange(mixed)
```

runtime helper 也应区分：

```ts
bindText(textNode, () => value)
insert(parent, value, marker)
bindDynamic(parent, marker, () => value)
```

推荐：

- `{string | number}` 走 `bindText`
- `{Node | array | component}` 走 `bindDynamic`
- 条件/数组表达式先走 `bindDynamic`

### 18.3 Anchor / Region 模型要比 marker 更高一层

单个 dynamic text 可以用 marker，但 `Show` / `For` / Fragment 需要“区域”。

建议 IR 中不要只表达 `Marker`，而要表达 `AnchorRange`：

```ts
export type AnchorRef = {
  start: IRRef
  end?: IRRef
}

export type RegionIR = BaseIRNode & {
  kind: 'Region'
  ref: AnchorRef
  children: ZeusIRNode[]
  mode: 'single' | 'range'
}
```

runtime helper：

```ts
export type Region = {
  start: Comment
  end: Comment
}

export function createRegion(parent: Node, marker: Comment): Region

export function clearRegion(region: Region): void

export function insertIntoRegion(region: Region, value: JSXValue): void
```

这样后续 `Show` 可以自然变成：

```ts
_bindShow(
  _region$,
  () => visible(),
  () => {
    return _tmpl$().firstChild
  },
)
```

`For` 可以自然变成：

```ts
_bindFor(_region$, () => items(), item => {
  return _createItemScope(() => ...)
})
```

### 18.4 DOM namespace 必须进 IR

SVG 不能只靠 `isSVG` boolean 粗略处理。

这些场景会出问题：

```tsx
<svg>
  <foreignObject>
    <div />
  </foreignObject>
</svg>
```

建议：

```ts
export type Namespace = 'html' | 'svg' | 'mathml'

export type ElementIR = BaseIRNode & {
  kind: 'Element'
  namespace: Namespace
  tagName: string
  // ...
}
```

新增 pass：

```txt
assignNamespaces
```

规则：

- `<svg>` 进入 `svg`
- `<math>` 进入 `mathml`
- `<foreignObject>` 子树回到 `html`

template codegen 也要知道 namespace，后续 runtime `template` 可能需要：

```ts
template(html, { namespace: 'svg' })
```

### 18.5 Props / children 传递语义需要提前定

组件不是 DOM element，不能只当函数调用。

需要明确：

```tsx
<MyComponent title="hello">
  <span />
  {name()}
</MyComponent>
```

props 应该是什么形态：

```ts
_createComponent(MyComponent, {
  title: 'hello',
  children: ...
})
```

关键问题：

- children 是立即创建 DOM，还是 lazy factory？
- 多 children 是数组还是 Fragment factory？
- 动态 children 是否保留响应式绑定？

推荐 MVP：

```ts
type ComponentChildren = JSXValue | (() => JSXValue)
```

编译输出优先用 lazy children：

```ts
_createComponent(MyComponent, {
  title: 'hello',
  get children() {
    return (() => {
      const _el$ = _tmpl$().firstChild
      return _el$
    })()
  },
})
```

更简单的 MVP 可先用：

```ts
children: () => [...]
```

但必须在文档里明确：组件 children 不应被提前变成不可追踪的静态数组。

### 18.6 Attribute / Property 判定不能只靠名字

DOM 上有三类绑定：

- attribute
- property
- special binding

例如：

```tsx
<input value={value()} checked={checked()} />
<label htmlFor={id()} />
<div class={{ active: ok() }} />
<div style={{ color: color() }} />
```

建议新增 binding kind：

```ts
export type BindingTarget =
  | 'attribute'
  | 'property'
  | 'event'
  | 'classList'
  | 'style'
  | 'ref'

export type BindingIR = BaseIRNode & {
  kind: 'Binding'
  target: BindingTarget
  name: string
  expr: t.Expression
}
```

新增 pass：

```txt
analyzeBindings
```

职责：

- `onClick` -> event
- `class` string -> attribute
- `classList` object -> classList
- `style` object -> style
- `value/checked/selected` -> property
- `ref` -> ref binding

这会让 lower 阶段保持简单，复杂 DOM 规则集中在一个 pass。

### 18.7 Source map 与 diagnostics 不能后补

编译器必须保留 source location，否则后续诊断质量会很差。

IR 基础节点已经有：

```ts
loc?: t.SourceLocation | null
```

但 lower 阶段必须实际写入：

```ts
loc: path.node.loc
```

diagnostic 应该绑定 IR node 或 Babel path：

```ts
export type CompilerDiagnostic = {
  code: CompilerErrorCode
  message: string
  loc?: t.SourceLocation | null
  hint?: string
}
```

需要提前支持的错误：

- unsupported spread children
- unsupported spread attribute
- invalid Host position
- Slot outside Host
- dynamic expression used where not supported
- invalid event handler
- invalid ref target

### 18.8 Template 安全与 escaping 要集中化

所有进入 template HTML 的内容都必须经过统一 escape。

不能分散在 lower/text/attribute/codegen 各处。

建议新增：

```txt
template/escape.ts
template/renderTemplate.ts
```

API：

```ts
export function escapeText(value: string): string
export function escapeAttribute(value: string): string
export function renderTemplate(node: ElementIR): string
```

规则：

- text escape：`& < >`
- attr escape：`& < "`
- 不要 escape 动态 expression，因为动态 expression 不进 template

### 18.9 Dev / Prod codegen 要有开关

Zeus 后续需要 dev diagnostics、source hint、runtime warning，也需要 prod 紧凑输出。

建议 config：

```ts
export type CompilerMode = 'development' | 'production'

export type CompilerOptions = {
  moduleName?: string
  mode?: CompilerMode
  irPipeline?: boolean
  dev?: boolean
}
```

codegen 根据 mode 决定：

- 是否保留 marker 注释内容
- 是否生成 displayName
- 是否生成 debug location
- 是否生成 runtime warning

例如 dev template：

```html
<button>
  count:
  <!--zeus:text:0-->
</button>
```

prod template：

```html
<button>
  count:
  <!>
</button>
```

### 18.10 HMR 边界要提前不破坏

Vite 阶段会需要 HMR。

当前不必实现，但 compiler 不应该生成让 HMR 完全无法接入的结构。

建议保留 component boundary metadata：

```ts
export type ComponentIR = BaseIRNode & {
  kind: 'Component'
  ref: IRRef
  callee: t.Expression
  props: ComponentPropIR[]
  hmrBoundary?: boolean
}
```

未来 Vite plugin 可基于文件级 component export 做 refresh。

### 18.11 测试需要分层，不只靠 snapshot

快照测试很有用，但不足以覆盖架构正确性。

建议测试分层：

```txt
lower.spec.ts       JSX -> IR
passes.spec.ts      IR -> analyzed IR
template.spec.ts    IR -> template HTML
codegen.spec.ts     IR -> Babel AST / code string
runtime.spec.ts     compiled output -> jsdom behavior
diagnostics.spec.ts invalid input -> error
```

每层测试目标不同：

- lower 测结构
- pass 测语义
- codegen 测输出
- runtime 测真实行为
- diagnostics 测错误质量

### 18.12 Public runtime helper contract 要版本化

compiler 和 runtime-dom 是强耦合关系。需要显式定义 compiler 使用的 helper contract。

建议新增文档或类型：

```txt
packages/compiler/src/runtime-contract/dom.ts
```

示例：

```ts
export const DOM_RUNTIME_HELPERS = {
  template: 'template',
  insert: 'insert',
  marker: 'marker',
  bindText: 'bindText',
  bindAttr: 'bindAttr',
  bindProp: 'bindProp',
  bindEvent: 'bindEvent',
  createComponent: 'createComponent',
} as const
```

不要在 codegen 中手写字符串散落各处。

---

## 19. 补充后的优先级调整

综合上面的遗漏点，推荐把下一步从“只做 Phase 1 + Phase 2”微调为：

```txt
Phase 1A：CompilerContext + runtime helper contract
Phase 1B：IR nodes + source loc + namespace + binding kind
Phase 2A：lower native JSX to IR
Phase 2B：assignNamespaces + analyzeBindings + assignDomPaths
Phase 2C：template rendering centralized escape
```

也就是说，新增 IR 时不要只加最小节点，还应同时把这些字段预留好：

```ts
loc?: t.SourceLocation | null
namespace?: Namespace
scope?: ScopePolicy
```

以及把动态表达式先建模成更通用的：

```ts
DynamicExpressionIR
```

再由 pass 降级到：

```ts
DynamicTextIR
DynamicNodeIR
DynamicRangeIR
```

这是比“所有表达式先当文本”更稳的方案。

---

## 20. 第二轮补充：真实编译器会踩到的工程边界

第 18 节补的是核心语义边界；这一节补的是实现编译器时容易被忽略、但会直接影响稳定性的工程边界。

### 20.1 HTML parser quirks 必须进入 template 策略

`template.innerHTML` 不是“字符串到 DOM 的透明映射”。浏览器 HTML parser 会自动修正某些结构。

典型例子：

```tsx
<table>
  <tr>
    <td>{value()}</td>
  </tr>
</table>
```

浏览器可能自动插入：

```html
<tbody>
  <tr>
    ...
  </tr>
</tbody>
```

这会影响 DOM path：

```txt
table.firstChild 可能不是 tr，而是 tbody
```

必须提前决定：

1. 允许 parser 修正，并在 `assignDomPaths` / template scan 中按真实 DOM 结构定位。
2. 或者 compiler 对 table/select 等特殊标签生成特殊 template。

推荐 MVP：

- 先承认 `template.innerHTML` 的真实 DOM 结构。
- DOM path 不完全靠静态 IR 推导，最终要有一个 `scanTemplate` pass 或 codegen helper 能从真实 template 结构验证路径。
- 对 `table/tr/td/select/option` 加专项测试。

建议新增测试：

```tsx
<table><tr><td>{value()}</td></tr></table>
<select><option>{label()}</option></select>
```

### 20.2 多根节点与 Fragment 返回值要明确

组件返回可能是：

```tsx
<>
  <span />
  <b />
</>
```

也可能是：

```tsx
return [nodeA, nodeB]
```

Zeus 要明确组件返回类型：

```ts
type JSXValue = Node | DocumentFragment | Node[] | string | number | null
```

推荐编译策略：

- 单根 element：返回 `Element`
- Fragment 多根：返回 `DocumentFragment`
- Fragment 中存在动态区域：用 region anchor 管理

Fragment IR 建议补充：

```ts
export type FragmentIR = BaseIRNode & {
  kind: 'Fragment'
  ref: IRRef
  children: ZeusIRNode[]
  mode: 'single' | 'fragment'
}
```

目标输出：

```ts
const _frag$ = document.createDocumentFragment()
_insert(_frag$, _childA$)
_insert(_frag$, _childB$)
return _frag$
```

### 20.3 Template hoisting 需要区分 module scope 与 function scope

静态 template 应 hoist 到 module scope：

```ts
var _tmpl$ = _template(`<div></div>`)
```

但不是所有 codegen 产物都能 hoist。

不能 hoist 的内容：

- 闭包捕获 props/state 的表达式
- event handler 表达式
- children factory
- ref callback

建议 IR 中区分：

```ts
export type HoistPolicy = 'module' | 'function' | 'none'
```

TemplateIR:

```ts
export type TemplateIR = BaseIRNode & {
  kind: 'Template'
  html: string
  ref: IRRef
  hoist: 'module'
}
```

### 20.4 Babel visitor 替换 JSX 时要避免重复访问

当前 visitor 是：

```ts
JSXElement: transformJSX
JSXFragment: transformJSX
```

当父 JSX 被替换时，Babel 仍可能继续访问子 JSX，导致重复 transform 或状态错乱。

推荐做法：

```ts
path.replaceWith(output)
path.skip()
```

或者只在“最外层 JSX”处理：

```ts
function isNestedJSX(path: BabelJSXPath): boolean {
  return (
    path.findParent(
      parent => parent.isJSXElement() || parent.isJSXFragment(),
    ) != null
  )
}
```

主 transform：

```ts
if (isNestedJSX(path)) return
```

这点在 IR-first 管线接入主流程时必须处理。

### 20.5 Import collision 与用户已有 import 要处理

用户代码里可能已经有：

```ts
import { template } from '@zeus-js/runtime-dom'
const _template = 1
```

compiler 生成 helper local 时必须保证不会冲突。

当前 `scope.generateUidIdentifier` 是对的，但还要保证：

- 相同 helper 只 import 一次
- 不同 module 的同名 helper 不冲突
- preserve user imports
- import 顺序稳定，方便 snapshot

建议 helper contract + import registry 输出时排序：

```ts
records.sort((a, b) => a.imported.localeCompare(b.imported))
```

### 20.6 Codegen 必须避免重复求值动态表达式

错误示例：

```tsx
<div title={expensive()}>{expensive()}</div>
```

如果 codegen 为了优化复用而错误缓存表达式，可能改变语义。

默认规则：

- 每个 JSX expression 独立求值。
- 只有明确证明纯静态时才能 hoist。
- 不要跨绑定点复用用户表达式结果。

对于：

```tsx
<div>{count()}</div>
```

应输出：

```ts
_bindText(_text$, () => count())
```

而不是：

```ts
const _v$ = count()
_bindText(_text$, () => _v$)
```

### 20.7 Event handler 需要验证函数形态

这些写法语义不同：

```tsx
<button onClick={handleClick} />
<button onClick={() => handleClick()} />
<button onClick={handleClick()} />
```

第三种会立即执行，通常不是用户想要的。

Zeus 可以先允许，但 dev 诊断应 warning：

```txt
onClick received a CallExpression. Did you mean onClick={() => handleClick()}?
```

EventBindingIR 可补充：

```ts
export type EventBindingIR = BaseIRNode & {
  kind: 'EventBinding'
  eventName: string
  handler: t.Expression
  options?: {
    capture?: boolean
    passive?: boolean
    once?: boolean
  }
}
```

事件 options 可以后续支持：

```tsx
<button onClickCapture={fn} />
```

### 20.8 Ref 语义要提前设计

`ref` 不是普通 attribute。

可能形式：

```tsx
<div ref={el => div = el} />
<div ref={divRef} />
```

推荐 MVP 只支持 callback ref：

```tsx
<div
  ref={el => {
    div = el
  }}
/>
```

IR：

```ts
export type RefBindingIR = BaseIRNode & {
  kind: 'RefBinding'
  target: IRRef
  expr: t.Expression
}
```

codegen：

```ts
_bindRef(_el$, el => {
  div = el
})
```

cleanup：

```ts
_bindRef(_el$, callback)
// dispose 时 callback(null) 是否调用，需要文档明确
```

建议：dispose 时 callback `null`，与主流框架预期接近。

### 20.9 Spread props 需要明确长期策略

当前 MVP 可以报错：

```tsx
<div {...props} />
```

但长期一定会需要。

建议策略：

- DOM spread：编译到 `spreadAttrs(el, props)`
- Component spread：编译到 object merge
- spread 顺序必须保持 JSX 语义

例子：

```tsx
<div id="a" {...props} class="x" />
```

后面的 `class="x"` 应覆盖 spread 中的 class，或按明确规则合并。

IR：

```ts
export type SpreadAttributeIR = BaseIRNode & {
  kind: 'SpreadAttribute'
  expr: t.Expression
  order: number
}
```

MVP 可以继续不支持，但 IR 预留会减少返工。

### 20.10 Static analysis 要区分 static / reactive / dynamic once

不是所有表达式都需要 effect。

例子：

```tsx
<div id="static" />
<div id={props.id} />
<div id={Math.random()} />
```

对 Zeus 来说：

- string literal：static inline
- signal getter：reactive binding
- 普通表达式：初始化求值一次，还是包 effect？

推荐 MVP 规则：

- JSX expression 默认视为 dynamic binding，用 effect 包裹。
- 后续由 `analyzeStaticExpressions` 优化明显静态表达式。

新增 pass：

```txt
analyzeStaticExpressions
```

输出：

```ts
export type EvaluationPolicy = 'static' | 'once' | 'reactive'
```

BindingIR：

```ts
evaluation: EvaluationPolicy
```

### 20.11 Keyed For 的 key 语义要提前留口

`For` 第一版可全量重建，但 IR 应该预留 key：

```tsx
<For each={items()} key={item => item.id}>
  {item => <div>{item.name}</div>}
</For>
```

IR：

```ts
export type ForIR = BaseIRNode & {
  kind: 'For'
  each: t.Expression
  item: t.Identifier
  index?: t.Identifier
  key?: t.Expression
  body: ZeusIRNode[]
}
```

这样后续从“正确但重建”升级到 keyed reconciliation 时不用改用户语义。

### 20.12 Web Components prop schema 应进入 compiler metadata

`defineElement` 不只是 runtime API，它影响 compiler 对 `Host` / `Slot` / props 的理解。

例子：

```tsx
defineElement(
  'z-counter',
  {
    shadow: false,
    props: {
      count: Number,
      open: Boolean,
    },
  },
  props => {
    return <Host>...</Host>
  },
)
```

compiler 需要识别：

- 当前 JSX 是否处于 `defineElement` render 函数内
- Host 是否合法
- Slot 在 shadow/light DOM 下 codegen 不同
- props schema 是否用于 attr/property reflection

建议 context 增加：

```ts
export type ElementCompileContext = {
  tagName: string
  shadow: boolean | 'open' | 'closed'
  props: Record<string, 'String' | 'Number' | 'Boolean' | 'Property'>
}
```

CompilerContext：

```ts
elementContext?: ElementCompileContext
```

### 20.13 诊断应支持 recoverable warning

不是所有问题都应该 throw。

例如：

- unstable For key：warning
- event handler is call expression：warning
- unsupported but fallbackable pattern：warning
- invalid Host position：error

建议：

```ts
export type DiagnosticSeverity = 'error' | 'warning'

export type CompilerDiagnostic = {
  severity: DiagnosticSeverity
  code: CompilerErrorCode
  message: string
  loc?: t.SourceLocation | null
  hint?: string
}
```

Program exit 时：

- error：throw
- warning：按 config 输出

### 20.14 Compiler pass 顺序要显式固定

不要让 pass 顺序散落在 transform 中。

建议：

```ts
export const DOM_PASS_PIPELINE = [
  normalizeChildren,
  validateBuiltins,
  assignNamespaces,
  analyzeBindings,
  analyzeExpressions,
  assignRegions,
  assignDomPaths,
  collectTemplates,
] as const
```

主流程：

```ts
runPassPipeline(ir, DOM_PASS_PIPELINE, context)
```

这样每个 pass 的输入输出假设更清楚。

### 20.15 IR 序列化能力很有价值

为了调试和未来 Rust 后端，IR 最好能序列化成 JSON。

问题是 Babel expression 不能直接稳定 JSON 化。

建议：

```ts
export type ExpressionRef = {
  kind: 'BabelExpression'
  node: t.Expression
  debug?: string
}
```

调试输出：

```ts
serializeIR(ir, {
  expressions: 'code',
})
```

这样可以输出：

```json
{
  "kind": "DynamicExpression",
  "expr": "count()"
}
```

新增调试命令或测试 helper：

```ts
expect(serializeIR(ir)).toMatchInlineSnapshot()
```

### 20.16 编译产物格式需要保持 tree-shaking 友好

不要生成会阻碍 tree-shaking 的大对象 runtime。

推荐：

```ts
import { template, bindText } from '@zeus-js/runtime-dom'
```

不推荐：

```ts
import * as runtime from '@zeus-js/runtime-dom'
runtime.bindText(...)
```

helper 必须按需导入。

### 20.17 CJS / ESM 输出边界先不做，但不要写死

当前包是 ESM，但 compiler 不应假设所有用户代码都是纯 ESM。

短期保持 ESM import 即可，长期由 bundler 处理。

但 runtime contract 不要依赖：

```ts
import.meta
top-level await
```

这些会增加集成限制。

### 20.18 文档里的代码草案需要修正一处 marker/text 混用

第 9.4 节的 `emitDynamicText` 草案中，`node.ref` 同时被当作 marker 和 text 使用，这是故意标注为草案，但正式方案应直接改成两个 ref。

建议 IR：

```ts
export type DynamicTextIR = BaseIRNode & {
  kind: 'DynamicText'
  expr: t.Expression
  markerRef: IRRef
  textRef: IRRef
  domPath?: DomPath
}
```

正式 codegen：

```ts
function emitDynamicText(
  node: DynamicTextIR,
  context: CompilerContext,
): t.Statement[] {
  const marker = context.importRuntime('marker')
  const insert = context.importRuntime('insert')
  const bindText = context.importRuntime('bindText')

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.markerRef.name),
        t.callExpression(marker, [
          t.identifier((node.domPath as { parent: IRRef }).parent.name),
          t.numericLiteral((node.domPath as { index: number }).index),
        ]),
      ),
    ]),
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.textRef.name),
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
      t.callExpression(insert, [
        t.identifier((node.domPath as { parent: IRRef }).parent.name),
        t.identifier(node.textRef.name),
        t.identifier(node.markerRef.name),
      ]),
    ),
    t.expressionStatement(
      t.callExpression(bindText, [
        t.identifier(node.textRef.name),
        t.arrowFunctionExpression([], node.expr),
      ]),
    ),
  ]
}
```

---

## 21. 再次调整后的近期最优落地顺序

如果把第 18、20 节都纳入考虑，近期最优顺序应调整为：

```txt
1. runtime helper contract
2. CompilerContext
3. IR nodes v1
   - loc
   - namespace
   - scope
   - DynamicExpressionIR
   - BindingIR
   - markerRef/textRef 分离
4. template escape/renderTemplate
5. lower JSX -> IR
6. assignNamespaces
7. analyzeBindings
8. analyzeExpressions
9. assignRegions
10. assignDomPaths
11. codegen/dom v1
```

第一批实现仍然只覆盖：

- native element
- static text
- dynamic expression
- static attr
- dynamic attr
- event attr
- simple component call

但是类型和 pass 顺序要按完整方向预留。

这能避免两类返工：

1. 现在为了快而把 expression 都写死成 text，后面又拆成 text/node/range。
2. 现在为了快而只做 marker，后面做 Show/For 时又重做 region。

---

## 22. 最终完整性审计

本节把还未显式覆盖、但会影响 Zeus compiler 长期稳定性的事项一次性补齐。它们按“必须进入架构设计，但不一定进入 MVP 实现”的标准列出。

### 22.1 JSX 名称解析必须完整

JSX tag name 不只有简单 identifier。

需要支持或诊断：

```tsx
<div />
<MyComponent />
<Foo.Bar />
<svg:path />
<my-element />
```

建议规则：

- lowercase HTML tag -> `ElementIR`
- kebab-case custom element -> `ElementIR` with `isCustomElement`
- PascalCase -> `ComponentIR`
- member expression `<Foo.Bar />` -> `ComponentIR`
- namespace name `<svg:path />` -> MVP 报错或明确转成 namespaced element

推荐新增：

```ts
export type JSXTag =
  | { kind: 'Intrinsic'; name: string }
  | { kind: 'CustomElement'; name: string }
  | { kind: 'Component'; expr: t.Expression }
  | { kind: 'Builtin'; name: 'Show' | 'For' | 'Host' | 'Slot' }
```

`parse/jsx.ts` 应该输出 `JSXTag`，而不是到处散落 `isComponentTag(tagName)`。

### 22.2 Builtin 解析必须先于 Component 解析

`Show`、`For`、`Host`、`Slot` 是编译期内置节点，不是普通组件。

解析顺序必须是：

```txt
JSX tag
  -> Builtin?
  -> Intrinsic/custom element?
  -> Component?
```

否则 `<Show>` 会被错误 lower 成 `ComponentIR`，后续很难补救。

### 22.3 JSX expression spread child 要明确

这种写法是 JSX spread child：

```tsx
<div>{...children}</div>
```

MVP 应直接报错：

```txt
UNSUPPORTED_SPREAD_CHILD
```

IR 不需要支持它，但 diagnostics 必须有明确错误。

### 22.4 注释、空白、文本规范化要有单一规则

JSX text 的 trim 规则会影响 template：

```tsx
<div>
  hello
  <span />
  world
</div>
```

必须集中在一个模块：

```txt
lower/normalizeJSXText.ts
```

规则建议：

- 多行缩进空白按 JSX 常规规则折叠
- 标签间纯空白删除
- 同一文本节点内保留必要单空格
- 不在多个模块里分别 trim

### 22.5 Attribute name canonicalization 要集中

属性名可能有多种形式：

```tsx
class
className
for
htmlFor
readonly
readOnly
tabindex
tabIndex
```

需要集中处理：

```txt
dom/attributeName.ts
```

建议输出：

```ts
export type CanonicalAttribute = {
  sourceName: string
  runtimeName: string
  target: 'attribute' | 'property'
}
```

不要在 lower、analyzeBindings、codegen 各自写一套映射。

### 22.6 Namespaced attributes 要预留

SVG 中会出现：

```tsx
<use xlinkHref="#icon" />
```

长期需要支持：

```ts
export type NamespacedAttributeIR = BaseIRNode & {
  kind: 'NamespacedAttribute'
  namespace: 'xlink' | 'xml'
  name: string
  value: t.Expression | string
}
```

MVP 可以先把 `xlinkHref` 映射到 `xlink:href`，其他报 warning 或 error。

### 22.7 Controlled input 语义不要过早发明

`value`、`checked` 是 property，但是否做受控输入是更高层语义。

MVP 只做：

```txt
value={expr} -> bindProp(input, 'value', () => expr)
checked={expr} -> bindProp(input, 'checked', () => expr)
```

不做：

- input event 自动回写 signal
- React-style controlled/uncontrolled warning
- v-model 风格语法

### 22.8 Style/class 对象语义要独立 runtime helper

不要把 style/class object 展开到大量 attr set。

目标 helper：

```ts
bindClassList(el, () => ({ active: ok(), hidden: !ok() }))
bindStyle(el, () => ({ color: color(), display: visible() ? '' : 'none' }))
```

IR：

```ts
BindingIR target: 'classList' | 'style'
```

MVP 可先只支持 string class/style，object style/classList 后续做。

### 22.9 Boolean attribute 与 property 规则要分离

HTML boolean attributes：

```tsx
disabled
checked
selected
readonly
```

但 DOM property 同名语义不同。

推荐：

- static `disabled` inline 成 `<button disabled>`
- dynamic `disabled={expr}` 默认 `bindAttr`
- `checked/value/selected` 在 form element 上由 `analyzeBindings` 转为 `bindProp`

### 22.10 Custom Element 属性策略要独立

Custom elements 的 property/attribute 不能完全按 HTML 内置规则。

```tsx
<my-el value={obj} count={1} open={true} />
```

推荐规则：

- primitive string/number/boolean 可 attr
- object/function/array 应 property
- 带 `prop:` 前缀可强制 property，后续可考虑

IR 需要能表达：

```ts
target: 'attribute' | 'property'
reason: 'html-rule' | 'custom-element' | 'explicit'
```

### 22.11 Security / CSP / Trusted Types 要预留

`template.innerHTML` 会涉及 Trusted Types / CSP。

MVP 可先不支持 Trusted Types，但 runtime contract 不要堵死：

```ts
template(html, options?)
```

未来可扩展：

```ts
template(policy.createHTML(html))
```

同时 compiler 必须保证用户动态表达式不拼进 template HTML，避免 XSS 设计缺陷。

### 22.12 SSR / hydration 是非目标，但 IR 不要排斥

MVP 不做 SSR/hydration，但 IR 如果完全绑定 DOM runtime，会影响未来。

建议：

- IR 表达语义，不表达浏览器 API。
- DOM codegen 是一个 adapter。
- 后续可有 `codegen/server`。

不要在 IR 中写：

```ts
document.createTextNode
HTMLElement
```

这些应只出现在 DOM codegen/runtime contract。

### 22.13 Compiler shared package 要提前规划

AGENTS.md 提到 `compiler-shared`。

当前可以先留在 `packages/compiler/src/ir`，但长期应迁出：

```txt
packages/compiler-shared/
  ir/
  diagnostics/
  runtime-contract/
```

迁出标准：

- Babel compiler 与未来 Rust/其他工具都需要它
- 不依赖 Babel NodePath
- 类型能序列化或稳定描述

### 22.14 IR 中 Babel Expression 是过渡方案

当前 TS/Babel 实现中 IR 持有 `t.Expression` 很方便，但这不是长期最终形态。

建议标注为：

```ts
export type ExpressionIR = {
  kind: 'BabelExpression'
  node: t.Expression
  debug?: string
}
```

未来 Rust 后端可替换为：

```ts
export type ExpressionIR = {
  kind: 'SourceExpression'
  source: string
  span: SourceSpan
}
```

### 22.15 SourceSpan 应与 Babel loc 解耦

不要长期把 `t.SourceLocation` 作为唯一 source location。

建议：

```ts
export type SourceSpan = {
  filename?: string
  start: { line: number; column: number; index?: number }
  end: { line: number; column: number; index?: number }
}
```

IR 用：

```ts
span?: SourceSpan
```

Babel lowering 时从 `node.loc` 转换。

### 22.16 Compiler options 要区分 public 与 internal

建议：

```ts
export type CompilerOptions = {
  mode?: 'development' | 'production'
  moduleName?: string
  generate?: 'dom'
}

export type InternalCompilerOptions = Required<CompilerOptions> & {
  irPipeline: boolean
  filename?: string
  dev: boolean
}
```

`resolveConfig` 负责填默认值。

### 22.17 Error code 要稳定

错误码不应该随手写字符串。

建议：

```ts
export enum CompilerErrorCode {
  UnsupportedSpreadAttribute = 'ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE',
  UnsupportedSpreadChild = 'ZEUS_UNSUPPORTED_SPREAD_CHILD',
  InvalidBuiltinUsage = 'ZEUS_INVALID_BUILTIN_USAGE',
  InvalidEventHandler = 'ZEUS_INVALID_EVENT_HANDLER',
  InvalidRefTarget = 'ZEUS_INVALID_REF_TARGET',
}
```

文档、测试、diagnostics 都用这些 code。

### 22.18 AST replacement 要保持 comments

用户可能写：

```tsx
const view = (
  // important
  <div />
)
```

Babel replace 时可能丢 comment。

建议：

```ts
t.inheritsComments(output, path.node)
t.inherits(output, path.node)
```

快照测试不一定覆盖，但实现时要注意。

### 22.19 Pure annotation 策略要统一

template hoist 应带 pure annotation：

```ts
var _tmpl$ = /*#__PURE__*/ _template(`<div></div>`)
```

不要各处手写。

新增 helper：

```ts
export function annotatePure<T extends t.Node>(node: T): T
```

### 22.20 Minifier 友好输出要考虑

生成代码应尽量：

- helper local 短且稳定
- 不生成无用临时变量
- 不生成 object spread 大量 helper
- prod 下 marker 内容最短

但 MVP 优先正确性。优化 pass 后置。

### 22.21 Incremental build cache 要预留

Vite plugin 阶段会需要缓存。

compiler 输入缓存 key 应至少包含：

- filename
- source
- compiler options
- runtime contract version

当前不用实现，但 `compile()` API 设计不要阻止。

### 22.22 Runtime contract version 要显式

compiler 与 runtime-dom 强耦合，必须知道 helper contract 版本。

建议：

```ts
export const DOM_RUNTIME_CONTRACT_VERSION = 1
```

compiler 生成 dev 代码时可选注入：

```ts
_assertRuntimeVersion(1)
```

prod 不注入。

### 22.23 Dev warnings 不应污染 production

所有 dev-only codegen 都应该由 mode 控制。

例如：

```ts
if (context.options.dev) {
  emitRuntimeVersionAssert()
}
```

生产输出不能包含 warning 字符串。

### 22.24 Plugin API 不要绑定 Babel

未来可能有 Rust compiler，因此公共 compiler API 不应只暴露 Babel plugin。

建议长期 API：

```ts
export function compile(source: string, options: CompilerOptions): CompileResult

export type CompileResult = {
  code: string
  map?: unknown
  diagnostics: CompilerDiagnostic[]
}
```

Babel plugin 是 adapter：

```txt
BabelPlugin -> compileModule adapter
```

### 22.25 Playground fixtures 要成为回归测试来源

`playground/compiler/src/cases` 中的 case 应逐步变成 compiler fixture。

建议目录：

```txt
packages/compiler/__fixtures__/
  basic/
  expressions/
  events/
  components/
  control-flow/
  web-components/
```

每个 fixture：

```txt
input.tsx
output.js
ir.json
```

### 22.26 性能基线要早一点建

编译器优化前需要基线。

建议先记录：

- transform 100 个简单组件耗时
- transform 1000 个元素耗时
- template 数量
- generated code size

不需要复杂 benchmark，先有 smoke benchmark。

### 22.27 AST codegen 不应依赖字符串拼 JS

除了 template HTML，JS codegen 应始终用 Babel AST。

禁止：

```ts
template.statement(`const ${name} = ...`)
```

除非是测试 helper。

### 22.28 Formatter 不应成为语义依赖

快照可以依赖 Babel generator 输出，但 compiler 不能依赖格式化细节。

测试应优先断言：

- helper import 存在
- template HTML 正确
- runtime behavior 正确

快照只是辅助。

---

## 23. IR v1 定稿建议

综合所有补充，建议 `IR v1` 不使用第 5 节的最小草案，而采用下面这版作为实现目标。

```ts
// packages/compiler/src/ir/nodes.ts

import type * as t from '@babel/types'

export type SourceSpan = {
  filename?: string
  start: { line: number; column: number; index?: number }
  end: { line: number; column: number; index?: number }
}

export type Namespace = 'html' | 'svg' | 'mathml'

export type ScopePolicy = 'inherit' | 'create'

export type EvaluationPolicy = 'static' | 'once' | 'reactive'

export type BindingTarget =
  | 'attribute'
  | 'property'
  | 'event'
  | 'classList'
  | 'style'
  | 'ref'

export type IRRef = {
  name: string
}

export type ExpressionIR = {
  kind: 'BabelExpression'
  node: t.Expression
  debug?: string
}

export type DomPath =
  | { kind: 'Root' }
  | { kind: 'FirstChild'; parent: IRRef }
  | { kind: 'NextSibling'; previous: IRRef }
  | { kind: 'Marker'; parent: IRRef; index: number }

export type BaseIRNode = {
  id: number
  span?: SourceSpan
  scope?: ScopePolicy
}

export type ProgramIR = BaseIRNode & {
  kind: 'Program'
  body: ZeusIRNode[]
}

export type ElementIR = BaseIRNode & {
  kind: 'Element'
  ref: IRRef
  tagName: string
  namespace: Namespace
  attrs: AttributeIR[]
  children: ZeusIRNode[]
  domPath?: DomPath
  flags: {
    isVoid: boolean
    isCustomElement: boolean
  }
}

export type TextIR = BaseIRNode & {
  kind: 'Text'
  value: string
}

export type DynamicExpressionIR = BaseIRNode & {
  kind: 'DynamicExpression'
  expr: ExpressionIR
  markerRef: IRRef
  valueRef?: IRRef
  domPath?: DomPath
  expected: 'text' | 'node' | 'mixed'
  evaluation: EvaluationPolicy
}

export type DynamicTextIR = BaseIRNode & {
  kind: 'DynamicText'
  expr: ExpressionIR
  markerRef: IRRef
  textRef: IRRef
  domPath?: DomPath
  evaluation: EvaluationPolicy
}

export type DynamicNodeIR = BaseIRNode & {
  kind: 'DynamicNode'
  expr: ExpressionIR
  markerRef: IRRef
  domPath?: DomPath
  evaluation: EvaluationPolicy
}

export type RegionIR = BaseIRNode & {
  kind: 'Region'
  startRef: IRRef
  endRef?: IRRef
  mode: 'single' | 'range'
  children: ZeusIRNode[]
}

export type StaticAttributeIR = BaseIRNode & {
  kind: 'StaticAttribute'
  name: string
  value: string | true
}

export type BindingIR = BaseIRNode & {
  kind: 'Binding'
  target: BindingTarget
  name: string
  expr: ExpressionIR
  evaluation: EvaluationPolicy
  reason?: 'html-rule' | 'custom-element' | 'explicit'
}

export type SpreadAttributeIR = BaseIRNode & {
  kind: 'SpreadAttribute'
  expr: ExpressionIR
  order: number
}

export type AttributeIR = StaticAttributeIR | BindingIR | SpreadAttributeIR

export type ComponentPropIR =
  | {
      kind: 'StaticProp'
      name: string
      value: string | number | boolean | null
    }
  | {
      kind: 'DynamicProp'
      name: string
      expr: ExpressionIR
    }
  | {
      kind: 'SpreadProp'
      expr: ExpressionIR
      order: number
    }

export type ComponentIR = BaseIRNode & {
  kind: 'Component'
  ref: IRRef
  callee: ExpressionIR
  props: ComponentPropIR[]
  children?: ComponentChildrenIR
  hmrBoundary?: boolean
}

export type ComponentChildrenIR = {
  kind: 'ComponentChildren'
  mode: 'none' | 'single' | 'array' | 'factory'
  children: ZeusIRNode[]
}

export type FragmentIR = BaseIRNode & {
  kind: 'Fragment'
  ref: IRRef
  children: ZeusIRNode[]
  mode: 'single' | 'fragment'
}

export type ShowIR = BaseIRNode & {
  kind: 'Show'
  when: ExpressionIR
  regionRef: IRRef
  children: ZeusIRNode[]
  fallback?: ZeusIRNode[]
}

export type ForIR = BaseIRNode & {
  kind: 'For'
  each: ExpressionIR
  item: t.Identifier
  index?: t.Identifier
  key?: ExpressionIR
  regionRef: IRRef
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

export type ScopeBoundaryIR = BaseIRNode & {
  kind: 'ScopeBoundary'
  ref: IRRef
  reason: 'Component' | 'Show' | 'ForItem' | 'CustomElement'
  children: ZeusIRNode[]
}

export type ZeusIRNode =
  | ElementIR
  | TextIR
  | DynamicExpressionIR
  | DynamicTextIR
  | DynamicNodeIR
  | RegionIR
  | ComponentIR
  | FragmentIR
  | ShowIR
  | ForIR
  | HostIR
  | SlotIR
  | ScopeBoundaryIR
```

这是建议的“实现版 IR v1”。第 5 节可以保留作为解释用的简化草案，但真正落地应以本节为准。

---

## 24. 最终版近期执行清单

如果现在开始写代码，按这个顺序最稳：

1. 新增 `runtime-contract/dom.ts`
2. 新增 `context/CompilerContext.ts`
3. 新增 `ir/nodes.ts`，采用第 23 节 IR v1
4. 新增 `ir/builders.ts`
5. 新增 `ir/serialize.ts`，用于测试和调试
6. 新增 `template/escape.ts`
7. 新增 `template/renderTemplate.ts`
8. 新增 `parse/tag.ts`，输出 `JSXTag`
9. 新增 `lower/*`，只 lower，不 codegen
10. 新增 `passes/assignNamespaces.ts`
11. 新增 `passes/analyzeBindings.ts`
12. 新增 `passes/analyzeExpressions.ts`
13. 新增 `passes/assignRegions.ts`
14. 新增 `passes/assignDomPaths.ts`
15. 新增 `passes/collectTemplates.ts`
16. 新增 `codegen/dom/*`
17. 用 feature flag 接入主 `transformJSX`
18. 迁移现有快照测试到新链路
19. 删除旧 `TransformResults` 拼装路径

第一批验收输入：

```tsx
const App = props => (
  <div id={props.id} onClick={props.onClick}>
    hello {props.name}
    <span class="static" />
  </div>
)
```

第一批必须验证：

- IR serialization 正确
- template HTML 正确
- DOM path 正确
- import helper 去重
- generated code snapshot 正确
- jsdom 行为正确
