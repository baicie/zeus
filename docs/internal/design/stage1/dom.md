可以。基于前面分析，Zeus 的最终优化方案建议定为：

```txt id="ftb0xn"
Compiler 优先生成直接 DOM 导航路径：
  firstChild
  nextSibling
  childNodes[index]

marker(parent, index) 只作为 fallback。
```

这基本对齐 SolidJS / dom-expressions 的路线：它的编译产物会先通过 `firstChild / nextSibling` 拿到 DOM 节点和锚点，然后再执行 `insert()`；不是运行时扫描 marker。Solid 的产物里可以看到先声明 `_el$13 = _el$12.firstChild`、`_el$18 = _el$13.nextSibling` 等 DOM 引用，再调用 `_$insert(..., _el$13)` 插入动态内容。

---

# 1. 当前 Zeus 的问题

你现在 Zeus 的链路是：

```txt id="qhkdfk"
DynamicText / Component / Show / For / Slot
  ↓
collectTemplates() 输出 <!>
  ↓
assignDomPaths() 分配 Marker(parent, index)
  ↓
emitDomPath() 生成 marker(parent, index)
  ↓
runtime marker() 扫描 parent.childNodes
```

当前 `marker()` 运行时会遍历 `parent.childNodes`，查找 `''` 或 `'!'` 的注释节点。

当前 `emitDomPath()` 遇到 `Marker` 会生成 runtime helper 调用：

```ts id="1tppyu"
marker(parent, index)
```

所以性能瓶颈来自这里。

而你的 `collectTemplates()` 会把动态节点渲染成 `<!>`，`assignDomPaths()` 会给 `DynamicText / Component / Show / For / Slot` 分配 marker 位置。

---

# 2. 最终设计目标

优化后的编译产物应该从：

```ts id="i5qr8j"
const _marker$ = _marker(_el$, 0)
const _text$ = document.createTextNode('')

_insert(_el$, _text$, _marker$)
_bindText(_text$, () => props.name)
```

变成：

```ts id="ajcp4i"
const _anchor$ = _el$.firstChild
const _text$ = document.createTextNode('')

_insert(_el$, _text$, _anchor$)
_bindText(_text$, () => props.name)
```

复杂点的场景：

```tsx id="jjq13a"
<div>
  hello
  {props.name}
  <span>{props.age}</span>
  <Show when={props.visible}>
    <p>ok</p>
  </Show>
</div>
```

模板：

```html id="rz6n82"
<div>
  hello<!><span><!></span
  ><!>
</div>
```

目标产物：

```ts id="iyh07u"
const _el$ = _tmpl$().firstChild

// 先解析所有 DOM / anchor 引用
const _dyn$ = _el$.childNodes[1]
const _span$ = _dyn$.nextSibling
const _dyn$2 = _span$.firstChild
const _show$ = _span$.nextSibling

// 再执行 insert / bind / mount
const _text$ = document.createTextNode('')
_insert(_el$, _text$, _dyn$)
_bindText(_text$, () => props.name)

const _text$2 = document.createTextNode('')
_insert(_span$, _text$2, _dyn$2)
_bindText(_text$2, () => props.age)

_mountShow(_el$, _show$, () => props.visible, () => ...)
```

关键点是：

```txt id="yxln9s"
必须先声明所有 anchor，再执行任何 insert。
```

因为一旦先 insert，`childNodes[index]` 就会变化。

---

# 3. 最终架构

保留两套路径：

```txt id="xdivi8"
DomPath：
  逻辑路径 / fallback
  例如 Marker(parent, markerIndex)

PhysicalDomPath：
  编译期物理 DOM 导航路径
  例如 FirstChild / NextSibling / ChildNode
```

推荐结构：

```txt id="g04ulz"
assignDomPaths()
  继续保留，给 fallback 用

assignPhysicalDomPaths()
  新增，生成高性能 DOM 导航路径

emitElement()
  优先使用 physicalDomPath
  所有 DOM/anchor 引用先声明

emitBinding()
  不再调用 marker() 找 anchor
  直接使用 node.ref.name 作为 anchor
```

---

# 4. IR 设计

修改：

```txt id="oqd3dt"
packages/compiler/src/ir/nodes.ts
```

增加 `PhysicalDomPath`：

```ts id="elh4wn"
export type PhysicalDomPath =
  | {
      kind: 'Root'
    }
  | {
      kind: 'FirstChild'
      parent: IRRef
    }
  | {
      kind: 'NextSibling'
      previous: IRRef
    }
  | {
      kind: 'ChildNode'
      parent: IRRef
      index: number
    }
```

给需要真实 DOM 引用的节点增加 `physicalDomPath`：

```ts id="ibmaw9"
export type ElementIR = SemanticBaseIRNode & {
  kind: 'Element'
  ref: IRRef
  tagName: string
  attrs: AttributeIR[]
  children: ZeusIRNode[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
  flags: {
    isSVG: boolean
    isVoid: boolean
    isCustomElement: boolean
  }
}

export type DynamicTextIR = SemanticBaseIRNode & {
  kind: 'DynamicText'
  expr: t.Expression

  /**
   * 优化后语义：
   * ref 表示模板中的 comment anchor。
   * 真实 Text 节点在 emit 阶段临时创建。
   */
  ref: IRRef

  once?: boolean
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}

export type ComponentIR = SemanticBaseIRNode & {
  kind: 'Component'
  ref: IRRef
  callee: t.Expression
  props: ComponentPropIR[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}

export type ShowIR = SemanticBaseIRNode & {
  kind: 'Show'
  ref: IRRef
  when: t.Expression
  children: ZeusIRNode[]
  fallback?: t.Expression | ZeusIRNode[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}

export type ForIR = SemanticBaseIRNode & {
  kind: 'For'
  ref: IRRef
  each: t.Expression
  by?: t.Expression
  item: t.Identifier
  index?: t.Identifier
  body: ZeusIRNode[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}

export type SlotIR = SemanticBaseIRNode & {
  kind: 'Slot'
  ref: IRRef
  name?: string
  fallback: ZeusIRNode[]
  domPath?: DomPath
  physicalDomPath?: PhysicalDomPath
}
```

注意这里最关键的是：

```txt id="31wji6"
DynamicTextIR.ref 从“Text 节点 ref”改成“comment anchor ref”。
```

这样 `DynamicText / Component / Show / For / Slot` 的 `ref` 语义统一：都表示模板里的锚点节点。

---

# 5. 新增 pass：assignPhysicalDomPaths

新增文件：

```txt id="b8pb2t"
packages/compiler/src/passes/assignPhysicalDomPaths.ts
```

它根据模板真实输出顺序计算物理 DOM 路径。

真实 DOM 子节点需要包含：

```txt id="l5qcbg"
TextIR        -> 真实 Text，占 childNodes 索引
ElementIR     -> 真实 Element，有 ref
DynamicTextIR -> Comment anchor，有 ref
ComponentIR   -> Comment anchor，有 ref
ShowIR        -> Comment anchor，有 ref
ForIR         -> Comment anchor，有 ref
SlotIR        -> Comment anchor，有 ref
FragmentIR    -> 展开
HostIR        -> 展开
```

代码草案：

```ts id="w2hn45"
import type {
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  ForIR,
  IRRef,
  PhysicalDomPath,
  ShowIR,
  SlotIR,
  ZeusIRNode,
} from '../ir/nodes'

type RefNode = ElementIR | DynamicTextIR | ComponentIR | ShowIR | ForIR | SlotIR

type PhysicalNode =
  | RefNode
  | {
      kind: 'TextPlaceholder'
    }

export function assignPhysicalDomPaths(node: ZeusIRNode): ZeusIRNode {
  visitNode(node)
  return node
}

function visitNode(node: ZeusIRNode, parent?: ElementIR): void {
  switch (node.kind) {
    case 'Element':
      assignElementPhysicalPath(node, parent)
      assignChildrenPhysicalPaths(node)
      return

    case 'Fragment':
      for (const child of node.children) {
        visitNode(child, parent)
      }
      return

    case 'Host':
      for (const child of node.children) {
        visitNode(child, parent)
      }
      return

    case 'Show':
      for (const child of node.children) {
        visitNode(child)
      }

      if (Array.isArray(node.fallback)) {
        for (const child of node.fallback) {
          visitNode(child)
        }
      }

      return

    case 'For':
      for (const child of node.body) {
        visitNode(child)
      }
      return

    case 'Slot':
      for (const child of node.fallback) {
        visitNode(child)
      }
      return

    case 'Component':
      for (const prop of node.props) {
        if (!Array.isArray(prop.value)) continue

        for (const child of prop.value) {
          visitNode(child)
        }
      }
      return

    case 'Text':
    case 'DynamicText':
      return
  }
}

function assignElementPhysicalPath(node: ElementIR, parent?: ElementIR): void {
  if (!parent) {
    node.physicalDomPath = {
      kind: 'Root',
    }
    return
  }

  const physicalChildren = flattenPhysicalChildren(parent.children)
  const index = physicalChildren.indexOf(node)

  if (index < 0) return

  node.physicalDomPath = createPhysicalPath(parent.ref, physicalChildren, index)
}

function assignChildrenPhysicalPaths(parent: ElementIR): void {
  const physicalChildren = flattenPhysicalChildren(parent.children)

  for (let index = 0; index < physicalChildren.length; index++) {
    const child = physicalChildren[index]

    if (child.kind === 'TextPlaceholder') continue

    child.physicalDomPath = createPhysicalPath(
      parent.ref,
      physicalChildren,
      index,
    )
  }

  for (const child of parent.children) {
    visitNode(child, parent)
  }
}

function createPhysicalPath(
  parent: IRRef,
  children: PhysicalNode[],
  index: number,
): PhysicalDomPath {
  if (index === 0) {
    return {
      kind: 'FirstChild',
      parent,
    }
  }

  const previous = findPreviousRefNode(children, index)

  if (previous) {
    return {
      kind: 'NextSibling',
      previous: previous.ref,
    }
  }

  return {
    kind: 'ChildNode',
    parent,
    index,
  }
}

function findPreviousRefNode(
  children: PhysicalNode[],
  index: number,
): RefNode | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const node = children[i]

    if (node.kind === 'TextPlaceholder') continue

    return node
  }

  return undefined
}

function flattenPhysicalChildren(children: ZeusIRNode[]): PhysicalNode[] {
  const result: PhysicalNode[] = []

  for (const child of children) {
    appendPhysicalChild(result, child)
  }

  return result
}

function appendPhysicalChild(result: PhysicalNode[], node: ZeusIRNode): void {
  switch (node.kind) {
    case 'Text':
      if (node.value.length > 0) {
        result.push({
          kind: 'TextPlaceholder',
        })
      }
      return

    case 'Element':
    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Slot':
      result.push(node)
      return

    case 'Fragment':
      for (const child of node.children) {
        appendPhysicalChild(result, child)
      }
      return

    case 'Host':
      for (const child of node.children) {
        appendPhysicalChild(result, child)
      }
      return
  }
}
```

---

# 6. passes 入口导出

修改：

```txt id="zl810w"
packages/compiler/src/passes/index.ts
```

增加：

```ts id="5gd1af"
export * from './assignPhysicalDomPaths'
```

---

# 7. pipeline 接入

在 JSX transform pipeline 里，保持当前逻辑路径 pass，同时加物理路径 pass：

```ts id="cefg8z"
normalizeChildren(ir)
validateBuiltins(ir)

assignDomPaths(ir)
assignPhysicalDomPaths(ir)

analyzeBindings(ir)
collectTemplates(ir, context)

return emitDOM(ir, context)
```

建议顺序：

```txt id="v1tud6"
assignDomPaths()
assignPhysicalDomPaths()
collectTemplates()
emitDOM()
```

`assignPhysicalDomPaths()` 不依赖 `collectTemplates()` 的结果，但必须和 `collectTemplates()` 的模板输出规则一致。

---

# 8. emitPhysicalDomPath

修改：

```txt id="ij7cm7"
packages/compiler/src/codegen/dom/emitDomPath.ts
```

新增：

```ts id="j6d8by"
import * as t from '@babel/types'

import type { CompilerContext } from '../../context'
import type { DomPath, PhysicalDomPath } from '../../ir/nodes'

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

    case 'Child':
      return t.callExpression(context.importRuntime('child'), [
        t.identifier(path.parent.name),
        t.numericLiteral(path.index),
      ])

    case 'Marker':
      return t.callExpression(context.importRuntime('marker'), [
        t.identifier(path.parent.name),
        t.numericLiteral(path.index),
      ])
  }
}

export function emitPhysicalDomPath(path: PhysicalDomPath): t.Expression {
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

    case 'ChildNode':
      return t.memberExpression(
        t.memberExpression(
          t.identifier(path.parent.name),
          t.identifier('childNodes'),
        ),
        t.numericLiteral(path.index),
        true,
      )
  }
}
```

---

# 9. emitElement：先声明所有 DOM / anchor ref

你当前 `emitElement()` 已经是先 clone，再声明元素，再 emit bindings。这个顺序很适合改造。

修改目标：

```txt id="o2xx9m"
1. clone root
2. 提前声明所有需要的 Element ref 和 anchor ref
3. 再执行 bind / insert / mount
```

代码草案：

```ts id="3rzi0d"
import * as t from '@babel/types'

import { emitBindings } from './emitBinding'
import { emitPhysicalDomPath } from './emitDomPath'
import { emitTemplateClone } from './emitTemplate'

import type {
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  ForIR,
  ShowIR,
  SlotIR,
  ZeusIRNode,
} from '../../ir/nodes'
import type { CompilerContext } from '../../context'

type DomRefNode =
  | ElementIR
  | DynamicTextIR
  | ComponentIR
  | ShowIR
  | ForIR
  | SlotIR

export function emitElement(
  node: ElementIR,
  context: CompilerContext,
): t.Expression {
  if (!hasRuntimeWork(node)) {
    return emitTemplateClone(node, context)
  }

  const statements: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.ref.name),
        emitTemplateClone(node, context),
      ),
    ]),

    ...emitDomRefDeclarations(node.children),

    ...emitBindings(node, context),

    t.returnStatement(t.identifier(node.ref.name)),
  ]

  return t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement(statements)),
    [],
  )
}

function emitDomRefDeclarations(children: ZeusIRNode[]): t.Statement[] {
  const statements: t.Statement[] = []

  for (const child of children) {
    collectDomRefDeclaration(child, statements)
  }

  return statements
}

function collectDomRefDeclaration(
  node: ZeusIRNode,
  statements: t.Statement[],
): void {
  switch (node.kind) {
    case 'Element':
      if (needsDomRefDeclaration(node)) {
        statements.push(createDomRefDeclaration(node))
      }

      for (const child of node.children) {
        collectDomRefDeclaration(child, statements)
      }

      return

    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Slot':
      statements.push(createDomRefDeclaration(node))
      return

    case 'Fragment':
      for (const child of node.children) {
        collectDomRefDeclaration(child, statements)
      }
      return

    case 'Host':
      for (const child of node.children) {
        collectDomRefDeclaration(child, statements)
      }
      return

    default:
      return
  }
}

function createDomRefDeclaration(node: DomRefNode): t.VariableDeclaration {
  if (!node.physicalDomPath) {
    throw new Error(`${node.kind} physical DOM path is not assigned`)
  }

  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(node.ref.name),
      emitPhysicalDomPath(node.physicalDomPath),
    ),
  ])
}

function needsDomRefDeclaration(node: ElementIR): boolean {
  if (!node.physicalDomPath) return false

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
        return needsDomRefDeclaration(child)

      case 'Fragment':
        return child.children.some(inner =>
          inner.kind === 'Element'
            ? needsDomRefDeclaration(inner)
            : inner.kind !== 'Text',
        )

      case 'Host':
        return child.children.some(inner =>
          inner.kind === 'Element'
            ? needsDomRefDeclaration(inner)
            : inner.kind !== 'Text',
        )

      default:
        return false
    }
  })
}

function hasRuntimeWork(node: ElementIR): boolean {
  return (
    node.attrs.some(attr => attr.kind !== 'StaticAttribute') ||
    node.children.some(hasChildRuntimeWork)
  )
}

function hasChildRuntimeWork(node: ZeusIRNode): boolean {
  switch (node.kind) {
    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Slot':
      return true

    case 'Element':
      return hasRuntimeWork(node)

    case 'Fragment':
    case 'Host':
      return node.children.some(hasChildRuntimeWork)

    default:
      return false
  }
}
```

---

# 10. emitBinding：使用提前声明好的 anchor

关键改造：

```txt id="84nqay"
不再在 emitDynamicText / emitMarkerInsert / emitMarkerMount 里调用 emitDomPath(marker)
直接使用 node.ref.name
```

你当前 `emitDynamicText()` 会自己创建 `markerRef = emitDomPath(node.domPath)`，这是需要删掉的部分。

---

## 改造后的 `emitDynamicText`

```ts id="5d8c1r"
function emitDynamicText(
  node: DynamicTextIR,
  context: CompilerContext,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  const textRef = context.uid('text$')

  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        textRef,
        t.callExpression(
          t.memberExpression(
            t.identifier('document'),
            t.identifier('createTextNode'),
          ),
          [
            node.once
              ? t.callExpression(t.identifier('String'), [node.expr])
              : t.stringLiteral(''),
          ],
        ),
      ),
    ]),

    t.expressionStatement(
      t.callExpression(context.importRuntime('insert'), [
        t.identifier(node.domPath.parent.name),
        t.cloneNode(textRef),
        t.identifier(node.ref.name),
      ]),
    ),

    ...(node.once
      ? []
      : [
          t.expressionStatement(
            t.callExpression(context.importRuntime('bindText'), [
              t.cloneNode(textRef),
              t.arrowFunctionExpression([], node.expr),
            ]),
          ),
        ]),
  ]
}
```

---

## 改造后的 `emitMarkerInsert`

```ts id="bbqh3m"
function emitMarkerInsert(
  node: ComponentIR | ShowIR | ForIR | SlotIR,
  context: CompilerContext,
  value: t.Expression,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  return [
    t.expressionStatement(
      t.callExpression(context.importRuntime('insert'), [
        t.identifier(node.domPath.parent.name),
        value,
        t.identifier(node.ref.name),
      ]),
    ),
  ]
}
```

---

## 改造后的 `emitMarkerMount`

```ts id="rswmt8"
function emitMarkerMount(
  node: ShowIR | ForIR,
  _context: CompilerContext,
  mountCall: t.Expression,
): t.Statement[] {
  if (!node.domPath || node.domPath.kind !== 'Marker') return []

  return [t.expressionStatement(mountCall)]
}
```

原因是 `emitMountShow()` / `emitMountFor()` 里本来就会用 `node.ref.name` 作为 marker 参数。

---

# 11. emitBuiltin：确认 Show / For 使用 node.ref

确保：

```ts id="sn0r4n"
_mountShow(parent, node.ref, ...)
_mountFor(parent, node.ref, ...)
```

类似：

```ts id="h8dtmz"
export function emitMountShow(
  node: ShowIR,
  context: CompilerContext,
): t.Expression {
  if (!node.domPath || node.domPath.kind !== 'Marker') {
    throw new Error('Show DOM path is not assigned')
  }

  return t.callExpression(context.importRuntime('mountShow'), [
    t.identifier(node.domPath.parent.name),
    t.identifier(node.ref.name),
    t.arrowFunctionExpression([], node.when),
    t.arrowFunctionExpression([], emitChildrenProp(node.children, context)),
    node.fallback
      ? t.arrowFunctionExpression([], emitFallback(node.fallback, context))
      : t.identifier('undefined'),
  ])
}
```

For 同理：

```ts id="a4xby6"
export function emitMountFor(
  node: ForIR,
  context: CompilerContext,
): t.Expression {
  if (!node.domPath || node.domPath.kind !== 'Marker') {
    throw new Error('For DOM path is not assigned')
  }

  const params = node.index ? [node.item, node.index] : [node.item]

  return t.callExpression(context.importRuntime('mountFor'), [
    t.identifier(node.domPath.parent.name),
    t.identifier(node.ref.name),
    t.arrowFunctionExpression([], node.each),
    node.by ?? t.identifier('undefined'),
    t.arrowFunctionExpression(params, emitChildrenProp(node.body, context)),
  ])
}
```

---

# 12. fallback 策略

即使启用高阶优化，也不要删除 `marker()`。

建议加一个 compiler option：

```ts id="sbvbjw"
export interface CompilerOptions {
  optimizeDomPath?: boolean
}
```

默认：

```ts id="xtp3py"
optimizeDomPath: true
```

在 `emitElement()` 里：

```ts id="l7i7vd"
if (context.options.optimizeDomPath !== false) {
  ...emitDomRefDeclarations(node.children)
}
```

如果关闭：

```txt id="7u9r68"
走原来的 marker(parent, index) 路径
```

这个便于排查 bug。

---

# 13. 注意事项：Text 节点必须计入索引

这个是最容易错的地方。

比如：

```tsx id="m9rxdi"
<div>hello{props.name}</div>
```

模板真实结构：

```txt id="na5y92"
0: Text("hello")
1: Comment("")
```

所以 anchor path 必须是：

```ts id="pd106z"
_el$.childNodes[1]
```

不能是：

```ts id="7p3qww"
_el$.firstChild
```

因为 firstChild 是 `hello` 文本。

这也是为什么 `assignPhysicalDomPaths()` 里要有 `TextPlaceholder`。

---

# 14. 注意事项：先声明所有 anchor

对于：

```tsx id="p8xojz"
<div>
  {a}
  {b}
  {c}
</div>
```

正确产物：

```ts id="zflgqy"
const _a$ = _el$.firstChild
const _b$ = _a$.nextSibling
const _c$ = _b$.nextSibling

const _text$ = document.createTextNode('')
_insert(_el$, _text$, _a$)

const _text$2 = document.createTextNode('')
_insert(_el$, _text$2, _b$)

const _text$3 = document.createTextNode('')
_insert(_el$, _text$3, _c$)
```

错误产物：

```ts id="dvuac3"
const _a$ = _el$.firstChild
_insert(_el$, textA, _a$)

const _b$ = _a$.nextSibling
```

这里 `_a$.nextSibling` 可能变成刚插入的 `textA`，而不是第二个 marker。

所以：

```txt id="e4j6c8"
DOM ref declaration 必须整体在 insert/bind/mount 前。
```

---

# 15. 测试设计

## 15.1 不生成 marker 调用

```ts id="ft8hoh"
it('emits direct DOM navigation instead of marker()', async () => {
  const code = `
    const App = props => (
      <div>
        {props.name}
        <span>{props.age}</span>
      </div>
    )
  `

  const output = await compile(code)

  expect(output).not.toContain('_marker(')
  expect(output).toContain('.firstChild')
  expect(output).toContain('.nextSibling')
})
```

---

## 15.2 确保 anchor 在 insert 前声明

```ts id="hj60rx"
it('declares all anchors before insert calls', async () => {
  const code = `
    const App = props => (
      <div>
        {props.a}
        {props.b}
        {props.c}
      </div>
    )
  `

  const output = await compile(code)

  const firstInsertIndex = output.indexOf('_insert(')

  expect(firstInsertIndex).toBeGreaterThan(0)

  const beforeInsert = output.slice(0, firstInsertIndex)

  expect(beforeInsert).toContain('.firstChild')
  expect(beforeInsert).toContain('.nextSibling')
})
```

---

## 15.3 Text 节点占位

```ts id="srp982"
it('accounts for text nodes when computing physical childNodes index', async () => {
  const code = `
    const App = props => (
      <div>
        hello
        {props.name}
      </div>
    )
  `

  const output = await compile(code)

  expect(output).toContain('.childNodes[1]')
})
```

---

## 15.4 嵌套元素

```ts id="zr9egc"
it('emits physical paths for nested dynamic text', async () => {
  const code = `
    const App = props => (
      <div>
        <section>
          <span>{props.name}</span>
        </section>
      </div>
    )
  `

  const output = await compile(code)

  expect(output).toContain('.firstChild')
  expect(output).toContain('.nextSibling')
  expect(output).not.toContain('_marker(')
})
```

---

# 16. 最终落地步骤

## Step 1：扩展 IR

```txt id="p8f914"
- 新增 PhysicalDomPath
- Element/DynamicText/Component/Show/For/Slot 增加 physicalDomPath
- DynamicTextIR.ref 语义改成 anchor ref
```

---

## Step 2：新增 assignPhysicalDomPaths

```txt id="ksv5cr"
- 根据真实模板输出顺序计算路径
- Text 节点计入 childNodes index
- Fragment / Host 展开
- Element / Dynamic / Component / Show / For / Slot 分配 path
```

---

## Step 3：codegen 新增 emitPhysicalDomPath

```txt id="3naax9"
- FirstChild -> parent.firstChild
- NextSibling -> previous.nextSibling
- ChildNode -> parent.childNodes[index]
```

---

## Step 4：emitElement 改成先声明全部 refs

```txt id="m3y8ej"
- root clone
- emitDomRefDeclarations(children)
- emitBindings()
- return root
```

---

## Step 5：emitBinding 不再内部找 marker

```txt id="s0ziex"
- DynamicText 创建 textRef
- insert(parent, textRef, node.ref)
- Component/Slot insert(parent, value, node.ref)
- Show/For mount(parent, node.ref, ...)
```

---

## Step 6：保留 marker fallback

```txt id="r4nvxe"
- runtime marker() 不删
- emitDomPath() Marker 不删
- optimizeDomPath: false 时可回退
```

---

# 17. 最终方案总结

最终 Zeus 编译器应该变成：

```txt id="shcfxw"
模板层：
  <div>hello<!><span><!></span><!></div>

IR 层：
  DynamicText.ref = anchor ref
  Show.ref = anchor ref
  physicalDomPath = firstChild / nextSibling / childNodes[index]

Codegen 层：
  const _dyn$ = _el$.childNodes[1]
  const _span$ = _dyn$.nextSibling
  const _dyn$2 = _span$.firstChild
  const _show$ = _span$.nextSibling

Runtime 层：
  insert(parent, value, anchor)
  bindText(text, getter)
  mountShow(parent, anchor, ...)
```

最终效果：

```txt id="7i2wfr"
1. 大多数场景不再生成 marker(parent, index)
2. 不再运行时扫描 parent.childNodes
3. 和 SolidJS 的产物策略接近
4. 仍保留 marker fallback，便于调试和回退
5. 先声明 anchor，再 insert，避免 childNodes 索引污染
```

这就是 Zeus 里最推荐的最终优化方案：**PhysicalDomPath + 预声明 anchor + marker fallback**。
