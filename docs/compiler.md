可以，下面给你一版 **Zeus Compiler 架构设计**。

这版按你现在的决策来：

- 响应式 API 直接对齐 alien-signals：`signal / computed / effect / effectScope / trigger`
- 编译器先用 Babel
- 后续可迁移 Rust
- 编译目标不是 Virtual DOM，而是 **template + DOM helper + 精准绑定**
- 支持未来 Web Components：`Host / Slot / defineElement`
- MVP 不做 SSR / hydration / Svelte 式响应式变量改写

---

# 1. 编译器总体定位

Zeus Compiler 的职责不是“实现响应式系统”，而是：

> 把 TSX/JSX 编译成高效的 DOM 创建代码和响应式绑定代码。

也就是说：

```tsx
<button onClick={() => count(count() + 1)}>{count()}</button>
```

不是编译成 VNode：

```ts
h("button", ...)
```

而是编译成：

```ts
const _tmpl = template(`<button><!--z-text-0--></button>`)

function Counter() {
  const _root = _tmpl()
  const _text = textPart(_root, 0)

  bindEvent(_root, 'click', () => count(count() + 1))
  bindText(_text, () => count())

  return _root
}
```

核心目标：

```txt
TSX/JSX
  ↓
Zeus IR
  ↓
优化
  ↓
runtime-dom helper 调用
  ↓
真实 DOM 精准更新
```

---

# 2. 编译器包结构

建议这样拆：

```txt
packages/
  compiler-shared/
    src/
      ir.ts
      helpers.ts
      diagnostics.ts
      symbols.ts
      dom.ts
      ast-utils.ts

  compiler-babel/
    src/
      index.ts
      plugin.ts
      context.ts

      passes/
        analyze-imports.ts
        analyze-components.ts
        transform-jsx.ts
        lower-jsx-to-ir.ts
        optimize-ir.ts
        codegen-dom.ts
        codegen-wc.ts
        inject-helpers.ts
        dev-warnings.ts

      lowering/
        lower-element.ts
        lower-component.ts
        lower-text.ts
        lower-expression.ts
        lower-show.ts
        lower-for.ts
        lower-fragment.ts
        lower-host.ts
        lower-slot.ts

      codegen/
        emit-template.ts
        emit-bindings.ts
        emit-component.ts
        emit-control-flow.ts
        emit-web-component.ts

  vite-plugin/
    src/
      index.ts
      transform.ts
      hmr.ts
      config.ts
```

其中最重要的是：

```txt
compiler-babel 只负责 Babel AST
compiler-shared 存 IR 和通用协议
runtime-dom 存编译产物依赖的 helper
```

这样以后你把 Babel 换成 Rust，只需要重写：

```txt
AST -> Zeus IR
```

后面的 IR 优化、helper 契约、runtime 都不用推翻。

---

# 3. 编译器整体流水线

Zeus Compiler 建议分 8 个阶段：

```txt
1. Parse
2. Import 分析
3. Component 分析
4. JSX Lowering
5. Zeus IR 生成
6. IR 优化
7. Codegen
8. Helper import 注入
```

展开如下：

```txt
源码 TSX
  ↓
Babel AST
  ↓
识别 Zeus import / 组件 / 内置节点
  ↓
JSX AST -> Zeus IR
  ↓
IR 优化
  ↓
生成 template + binding 代码
  ↓
自动注入 runtime helper
  ↓
输出 JS
```

---

# 4. 编译器不做什么

这个边界很重要。

## MVP 不做响应式语法改写

暂时不做这种：

```ts
let count = $state(0)
count++
```

也不做：

```ts
let count = 0
count++
```

自动变响应式。

Zeus v0 只支持显式 alien-signals 风格：

```ts
const count = signal(0)

count()
count(count() + 1)
```

编译器只关心 JSX 里的动态表达式：

```tsx
<div>{count()}</div>
```

它会编译成：

```ts
bindText(textNode, () => count())
```

---

## MVP 不做完整 JS 语义分析

比如：

```tsx
<div>{foo}</div>
```

编译器不会强行判断 `foo` 是不是 signal。
它只把动态表达式包成 accessor：

```ts
;() => foo
```

是否响应式由运行时决定。

如果 `foo` 不是响应式，effect 只会执行一次，没问题。

---

# 5. Zeus IR 设计

IR 是整个编译器的核心。

不要直接从 Babel AST 输出 runtime helper。
应该先转成 Zeus 自己的中间结构。

---

## 顶层 IR

```ts
export interface ComponentIR {
  type: 'component'
  name: string
  template: TemplateIR
  bindings: BindingIR[]
  imports: HelperImport[]
  mode: 'dom' | 'web-component'
}
```

---

## TemplateIR

```ts
export interface TemplateIR {
  id: string
  html: string
  parts: TemplatePartIR[]
}
```

例如：

```tsx
<button>{count()}</button>
```

对应：

```ts
{
  id: "_tmpl$1",
  html: "<button><!--z-text-0--></button>",
  parts: [
    {
      id: 0,
      kind: "text",
      marker: "z-text-0"
    }
  ]
}
```

---

## 为什么建议用 marker，而不是一开始用 path

有两种方案。

### 方案 A：node path

```ts
getNode(root, [0, 1])
```

优点：输出短。
缺点：空白文本、Fragment、浏览器 HTML 修正会让路径容易变脆。

### 方案 B：comment marker

```html
<!--z-text-0-->
```

然后：

```ts
textPart(root, 0)
```

优点：

- 稳
- 好调试
- 对初版编译器友好
- Show / For / Slot 都能统一用 anchor

缺点：

- DOM 里多 comment
- prod 后续可以优化掉

**MVP 建议用 comment marker。**
等 Zeus 编译器稳定后，再做 prod 模式 path/hole 优化。

---

# 6. BindingIR 设计

动态绑定统一收集成 BindingIR。

```ts
export type BindingIR =
  | TextBindingIR
  | InsertBindingIR
  | AttrBindingIR
  | PropBindingIR
  | EventBindingIR
  | RefBindingIR
  | ComponentBindingIR
  | ShowBindingIR
  | ForBindingIR
  | HostBindingIR
  | SlotBindingIR
```

---

## 文本绑定

```ts
export interface TextBindingIR {
  type: 'text'
  partId: number
  expr: BabelExpression
}
```

输入：

```tsx
<span>{count()}</span>
```

输出：

```ts
bindText(_text0, () => count())
```

---

## 动态插入绑定

用于表达式返回 Node、数组、字符串等复杂 children：

```ts
export interface InsertBindingIR {
  type: 'insert'
  partId: number
  expr: BabelExpression
}
```

输入：

```tsx
<div>{children()}</div>
```

输出：

```ts
insert(_anchor0, () => children())
```

MVP 可以先把所有 children 表达式都当 text。
但是更正确的长期设计是分：

```txt
text expression
node expression
array expression
unknown expression
```

unknown 走 `insert()`。

---

## 属性绑定

```ts
export interface AttrBindingIR {
  type: 'attr'
  partId: number
  name: string
  expr: BabelExpression
}
```

例如：

```tsx
<div title={title()} />
```

输出：

```ts
bindAttr(_el0, 'title', () => title())
```

---

## DOM property 绑定

```ts
export interface PropBindingIR {
  type: 'prop'
  partId: number
  name: string
  expr: BabelExpression
}
```

例如：

```tsx
<input value={name()} checked={checked()} />
```

输出：

```ts
bindProp(_input0, 'value', () => name())
bindProp(_input0, 'checked', () => checked())
```

---

## 事件绑定

```ts
export interface EventBindingIR {
  type: 'event'
  partId: number
  name: string
  expr: BabelExpression
  delegated: boolean
}
```

MVP 直接绑定：

```ts
bindEvent(_btn, 'click', handler)
```

后续 prod 模式可以：

```ts
_btn.$$click = handler
delegateEvents(['click'])
```

---

## 组件绑定

```ts
export interface ComponentBindingIR {
  type: 'component'
  partId: number
  component: BabelExpression
  props: PropIR[]
  children?: ChildIR[]
}
```

输入：

```tsx
<Card title={title()}>
  <span>hello</span>
</Card>
```

输出：

```ts
insert(
  _anchor0,
  createComponent(Card, {
    get title() {
      return title()
    },
    children: () => _tmpl$child(),
  }),
)
```

注意：组件 props 推荐用 getter 包一下。
这样子组件里访问 `props.title` 时仍然能读到动态值。

---

# 7. 内置节点设计

Zeus 的内置节点不是普通组件，而是编译期语义。

MVP 内置节点：

```tsx
<Show />
<For />
<Host />
<Slot />
```

---

## Show 编译

输入：

```tsx
<Show when={visible()}>
  <div>{count()}</div>
</Show>
```

模板：

```html
<!--z-show-0-->
```

输出：

```ts
mountShow(
  _show0,
  () => visible(),
  () => {
    const _root = _tmpl$show()
    const _text = textPart(_root, 0)
    bindText(_text, () => count())
    return _root
  },
)
```

ShowBindingIR：

```ts
export interface ShowBindingIR {
  type: 'show'
  partId: number
  when: BabelExpression
  body: TemplateIR
  fallback?: TemplateIR
}
```

---

## For 编译

输入：

```tsx
<For each={items()}>{item => <li>{item.name}</li>}</For>
```

输出：

```ts
mountFor(
  _for0,
  () => items(),
  (item, index) => {
    const _root = _tmpl$item()
    const _text = textPart(_root, 0)
    bindText(_text, () => item.name)
    return _root
  },
)
```

ForBindingIR：

```ts
export interface ForBindingIR {
  type: 'for'
  partId: number
  each: BabelExpression
  itemName: string
  indexName?: string
  body: TemplateIR
  key?: BabelExpression
}
```

MVP 先做正确版。
后续再支持 keyed diff：

```tsx
<For each={items()} by={item => item.id}>
  ...
</For>
```

---

# 8. Web Components 编译架构

Web Components 不要放到普通 DOM 编译路径里硬糊。
应该作为 codegen 的一个目标模式。

```txt
同一套 JSX -> IR
  ↓
DOM codegen
或
Web Component codegen
```

---

## defineElement 识别

输入：

```tsx
export default defineElement(
  'z-card',
  {
    shadow: true,
    props: {
      title: String,
    },
  },
  props => {
    return (
      <Host>
        <header>
          <Slot name="header" />
        </header>
        <main>
          <Slot />
        </main>
      </Host>
    )
  },
)
```

编译器识别：

```ts
defineElement(tag, options, setup)
```

然后进入 Web Component 编译模式。

---

## Host 编译规则

`Host` 是根宿主节点，不输出真实 `<Host>`。

```tsx
<Host>
  <div>hello</div>
</Host>
```

会编译成：

```ts
renderIntoHost(hostRoot, () => {
  return _tmpl()
})
```

或者直接在 generated custom element 里 append。

限制：

```txt
Host 只能出现在 defineElement setup 返回 JSX 的根位置
Host 不能嵌套
Host 不能作为普通组件使用
```

---

## Slot 编译规则

### shadow: true

```tsx
<Slot name="header" />
```

编译成原生：

```html
<slot name="header"></slot>
```

### shadow: false

编译成 Zeus light DOM marker：

```html
<!--z-slot-header-->
```

然后运行时：

```ts
setupLightDomProjection(host, slotMarkers)
```

---

# 9. Runtime helper 契约

编译器输出依赖一套稳定 runtime helper。

这些 helper 不一定给用户直接用，但编译产物会 import。

---

## MVP helper 清单

```ts
template
textPart
nodePart
insert
bindText
bindAttr
bindProp
bindEvent
createComponent
mountShow
mountFor
```

---

## DOM runtime 包

```txt
packages/runtime-dom/src/
  template.ts
  part.ts
  insert.ts
  binding.ts
  event.ts
  component.ts
  show.ts
  for.ts
  index.ts
```

---

## helper 设计

```ts
export function template(html: string): () => Node

export function textPart(root: Node, id: number): Text

export function nodePart(root: Node, id: number): Node

export function insert(anchor: Comment, value: unknown | (() => unknown)): void

export function bindText(node: Text, getter: () => unknown): void

export function bindAttr(el: Element, name: string, getter: () => unknown): void

export function bindProp(el: any, name: string, getter: () => unknown): void

export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void

export function createComponent(Component: Function, props: any): Node

export function mountShow(
  anchor: Comment,
  when: () => unknown,
  factory: () => Node,
  fallback?: () => Node,
): void

export function mountFor<T>(
  anchor: Comment,
  each: () => readonly T[],
  renderItem: (item: T, index: () => number) => Node,
  key?: (item: T) => unknown,
): void
```

---

# 10. 编译示例

## 输入

```tsx
import { signal } from 'zeus'

function Counter() {
  const count = signal(0)

  return (
    <button class="btn" onClick={() => count(count() + 1)}>
      count: {count()}
    </button>
  )
}
```

---

## 编译后目标代码

```ts
import { template, textPart, bindText, bindEvent } from '@zeus/runtime-dom'
import { signal } from 'zeus'

const _tmpl$1 = template(`<button class="btn">count: <!--z-text-0--></button>`)

function Counter() {
  const count = signal(0)

  const _root = _tmpl$1()
  const _text0 = textPart(_root, 0)

  bindEvent(_root, 'click', () => count(count() + 1))
  bindText(_text0, () => count())

  return _root
}
```

重点：

```txt
组件函数只初始化一次
count 改变时只更新 _text0
没有 VDOM
没有组件 rerender
```

---

# 11. Babel 插件架构

`compiler-babel/src/plugin.ts`：

```ts
export default function zeusBabelPlugin() {
  return {
    name: 'zeus-compiler',
    visitor: {
      Program(path, state) {
        const ctx = createCompilerContext(path, state)

        analyzeImports(ctx)
        analyzeComponents(ctx)

        path.traverse({
          JSXElement(jsxPath) {
            transformJSX(ctx, jsxPath)
          },
          JSXFragment(fragmentPath) {
            transformJSX(ctx, fragmentPath)
          },
        })

        injectHelpers(ctx)
        emitDiagnostics(ctx)
      },
    },
  }
}
```

不过真实实现中，不建议在每个 JSXElement 上独立 transform。
更稳的是：找到组件 return 的根 JSX，再整体 lowering。

---

## 更推荐的组件级 transform

```ts
Program(path, state) {
  const ctx = createCompilerContext(path, state)

  analyzeImports(ctx)

  path.traverse({
    FunctionDeclaration(fnPath) {
      if (!isComponent(fnPath)) return

      const jsxReturn = findJSXReturn(fnPath)
      if (!jsxReturn) return

      const ir = lowerComponentToIR(ctx, fnPath, jsxReturn)
      optimizeIR(ctx, ir)

      const replacement = codegenComponent(ctx, fnPath, ir)
      replaceComponentReturn(fnPath, jsxReturn, replacement)
    }
  })

  injectHelpers(ctx)
}
```

---

# 12. CompilerContext 设计

```ts
export interface CompilerContext {
  filename: string
  mode: 'development' | 'production'
  target: 'dom' | 'web-component'

  helpers: Map<string, HelperImport>
  templates: TemplateIR[]
  diagnostics: Diagnostic[]

  zeusImports: ZeusImportInfo

  generateUid(prefix: string): string
  addHelper(name: RuntimeHelper): BabelIdentifier
  addTemplate(template: TemplateIR): void
  warn(diagnostic: Diagnostic): void
  error(diagnostic: Diagnostic): never
}
```

它负责：

- 生成唯一变量名
- 记录需要导入哪些 helper
- 存储模板
- 收集 warning/error
- 区分 dev/prod 输出

---

# 13. Import 分析

编译器要知道哪些标识符是 Zeus 内置节点。

例如：

```ts
import { Show, For, Host, Slot } from 'zeus'
```

需要记录：

```ts
{
  Show: "Show",
  For: "For",
  Host: "Host",
  Slot: "Slot",
  signal: "signal",
  computed: "computed"
}
```

这样用户改名也能识别：

```ts
import { Show as ZShow } from 'zeus'
```

编译器仍然知道：

```tsx
<ZShow when={ok()} />
```

是内置 Show。

---

# 14. 组件识别规则

MVP 可以简单点：

符合以下之一就当组件：

```txt
1. 函数名大写开头
2. 返回 JSX
3. 被 defineElement 使用
```

例如：

```tsx
function App() {
  return <div />
}
```

识别为组件。

```tsx
const App = () => {
  return <div />
}
```

也识别为组件。

---

# 15. JSX lowering 规则

## 原生 DOM

```tsx
<div class="box" />
```

进入 template html。

---

## 大写标签

```tsx
<Card />
```

编译成：

```ts
createComponent(Card, props)
```

---

## 内置标签

```tsx
<Show />
<For />
<Host />
<Slot />
```

进入专门 lowering。

---

## 事件

```tsx
<button onClick={handler} />
```

MVP：

```ts
bindEvent(el, 'click', handler)
```

后续：

```ts
el.$$click = handler
delegateEvents(['click'])
```

---

## class

```tsx
<div class="a" />
```

静态进 template。

```tsx
<div class={cls()} />
```

动态：

```ts
bindAttr(el, 'class', () => cls())
```

后续优化为：

```ts
bindClass(el, () => cls())
```

---

## style

```tsx
<div style={{ color: color() }} />
```

MVP 可以先不支持对象 style，或者转：

```ts
bindStyle(el, () => ({ color: color() }))
```

建议 MVP 支持：

```txt
style string
style object
```

---

## ref

```tsx
<div ref={el} />
```

MVP 先支持函数 ref：

```tsx
<div
  ref={el => {
    div = el
  }}
/>
```

编译：

```ts
setRef(refExpr, el)
```

---

# 16. Optimizer 设计

MVP 的 optimizer 不需要复杂。
先做这些就够：

## 1. 静态属性进入 template

```tsx
<div id="a" class="b" />
```

直接进 HTML。

---

## 2. 静态文本合并

```tsx
<div>hello world</div>
```

合并成一个文本。

---

## 3. 动态 text marker 复用

每个动态文本只生成一个 marker。

---

## 4. 无 binding 模板纯 clone

如果一个组件 JSX 全静态：

```tsx
function Logo() {
  return <div class="logo">Zeus</div>
}
```

输出：

```ts
const _tmpl = template(`<div class="logo">Zeus</div>`)

function Logo() {
  return _tmpl()
}
```

---

## 5. dev/prod 差异

dev：

```html
<!--z-text-0-->
```

prod 可以更短：

```html
<!---->
```

或者后续完全改成 path。

---

# 17. Helper import 注入

不要在 codegen 里手写 import。

应该统一由 helper manager 处理。

```ts
ctx.addHelper('template')
ctx.addHelper('bindText')
ctx.addHelper('bindEvent')
```

最后统一注入：

```ts
import { template, textPart, bindText, bindEvent } from '@zeus/runtime-dom'
```

helper registry：

```ts
export const RuntimeHelpers = {
  template: {
    source: '@zeus/runtime-dom',
    name: 'template',
  },
  textPart: {
    source: '@zeus/runtime-dom',
    name: 'textPart',
  },
  bindText: {
    source: '@zeus/runtime-dom',
    name: 'bindText',
  },
  effect: {
    source: '@zeus/core',
    name: 'effect',
  },
}
```

---

# 18. Vite 插件架构

Vite 插件主要做集成，不要把编译逻辑塞进去。

```ts
export default function zeusPlugin(options = {}) {
  return {
    name: 'zeus',
    enforce: 'pre',

    config() {
      return {
        esbuild: {
          jsx: 'preserve',
        },
      }
    },

    async transform(code, id) {
      if (!/\.[jt]sx$/.test(id)) return null

      const result = await transformWithZeusBabel(code, {
        filename: id,
        mode:
          process.env.NODE_ENV === 'production' ? 'production' : 'development',
      })

      return {
        code: result.code,
        map: result.map,
      }
    },
  }
}
```

重点：

```txt
Vite 负责文件接入
compiler-babel 负责真正 transform
runtime-dom 负责运行
```

---

# 19. HMR 设计

MVP 先做粗粒度 HMR：

```txt
组件文件变化 -> 整个模块 reload
```

后续再做细粒度：

```txt
保留 signal 状态
只替换组件模板
```

Zeus v0 不要卡在 HMR 复杂度上。

---

# 20. Diagnostics 设计

编译器必须有诊断系统。

```ts
export interface Diagnostic {
  level: 'error' | 'warning'
  code: string
  message: string
  loc?: SourceLocation
}
```

MVP 必须报这些：

## Host 非法

```tsx
<div>
  <Host />
</div>
```

报错：

```txt
ZEUS_HOST_INVALID_POSITION:
<Host> can only be used as the root node of defineElement setup.
```

---

## Slot 非法

```tsx
function App() {
  return <Slot />
}
```

报错：

```txt
ZEUS_SLOT_OUTSIDE_HOST:
<Slot> can only be used inside <Host>.
```

---

## For children 非函数

```tsx
<For each={items()}>
  <div />
</For>
```

报错：

```txt
ZEUS_FOR_CHILDREN_MUST_BE_FUNCTION
```

---

## 不支持的 JSX spread

MVP 如果暂不支持：

```tsx
<div {...props} />
```

warning 或 error：

```txt
ZEUS_SPREAD_NOT_SUPPORTED_IN_MVP
```

---

# 21. MVP 实现顺序

我建议你按这个顺序实现 compiler：

---

## Step 1：只编译普通 DOM

支持：

```tsx
<div>hello</div>
<div>{value()}</div>
<button onClick={fn}>click</button>
```

实现：

```txt
template
textPart
bindText
bindEvent
bindAttr
```

完成标准：

```tsx
function App() {
  const count = signal(0)

  return <button onClick={() => count(count() + 1)}>{count()}</button>
}
```

可运行。

---

## Step 2：支持组件调用

支持：

```tsx
<Card title={title()} />
```

实现：

```txt
createComponent
props getter
children factory
```

---

## Step 3：支持 Fragment

```tsx
<>
  <div />
  <span />
</>
```

实现：

```txt
fragment template
multi-root return
insert fragment
```

MVP 简化：组件可以返回 `DocumentFragment`。

---

## Step 4：支持 Show

```tsx
<Show when={ok()}>
  <div />
</Show>
```

实现：

```txt
mountShow
anchor
subtree factory
```

---

## Step 5：支持 For

```tsx
<For each={items()}>{item => <li>{item.name}</li>}</For>
```

实现：

```txt
mountFor
item factory
scope cleanup
```

---

## Step 6：支持 Web Components Shadow

```tsx
defineElement('z-card', { shadow: true }, () => (
  <Host>
    <Slot />
  </Host>
))
```

实现：

```txt
defineElement transform
Host
Slot -> native slot
```

---

## Step 7：支持 Light DOM Slot

```tsx
defineElement('z-card', { shadow: false }, () => (
  <Host>
    <Slot name="header" />
    <Slot />
  </Host>
))
```

实现：

```txt
Slot -> marker
setupLightDomProjection
```

---

# 22. 最终架构图

```txt
                 ┌────────────────────┐
                 │      TSX Source     │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │     Babel AST       │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │  Analyze Imports    │
                 │  Analyze Component  │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │      Zeus IR        │
                 │ Template + Binding  │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
                 │    IR Optimizer     │
                 └─────────┬──────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
   ┌────────────────────┐    ┌────────────────────┐
   │   DOM Codegen       │    │ WebComponent Codegen│
   └─────────┬──────────┘    └─────────┬──────────┘
             │                         │
             ▼                         ▼
   ┌────────────────────┐    ┌────────────────────┐
   │ runtime-dom helper  │    │ runtime-wc helper   │
   └────────────────────┘    └────────────────────┘
```

---

# 23. 最重要的架构决策

最后我给你把 compiler 决策压缩成一版。

## Zeus Compiler v0 决策

```txt
1. 编译目标是真实 DOM，不是 VDOM。
2. 响应式语义交给 alien-signals。
3. 编译器只把 JSX 动态表达式变成 runtime binding。
4. 组件只初始化一次，不 rerender。
5. 编译器必须先生成 Zeus IR。
6. MVP 使用 comment marker 定位动态洞。
7. runtime helper 是稳定契约，不能随便改。
8. Show / For / Host / Slot 是编译期内置节点。
9. Web Components 是单独 codegen target。
10. Babel 只是第一版前端，未来可以替换 Rust。
```

---

# 24. 最小可开工文件

你现在可以先写这几个：

```txt
packages/compiler-shared/src/ir.ts
packages/compiler-shared/src/helpers.ts

packages/compiler-babel/src/context.ts
packages/compiler-babel/src/plugin.ts
packages/compiler-babel/src/passes/analyze-imports.ts
packages/compiler-babel/src/passes/analyze-components.ts
packages/compiler-babel/src/lowering/lower-element.ts
packages/compiler-babel/src/lowering/lower-expression.ts
packages/compiler-babel/src/codegen/emit-template.ts
packages/compiler-babel/src/codegen/emit-bindings.ts

packages/runtime-dom/src/template.ts
packages/runtime-dom/src/part.ts
packages/runtime-dom/src/binding.ts
packages/runtime-dom/src/event.ts
```

第一目标就是跑通：

```tsx
function App() {
  const count = signal(0)

  return <button onClick={() => count(count() + 1)}>{count()}</button>
}
```

只要这个能跑，Zeus Compiler 的骨架就成立了。
