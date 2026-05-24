# Zeus MVP-1.5：runtime-dom 与 compiler 细粒度更新闭环计划

本文档给出 Zeus 当前最推荐的下一阶段计划：先打通 `signal -> compiler output -> runtime-dom binding -> DOM 精确更新` 的最小闭环。

目标不是一次性做完 Web Components、Vite 插件或完整控制流，而是先证明 Zeus 的核心产品立场成立：

- 组件初始化只执行一次
- 状态变化不 rerender 组件
- 编译器生成真实 DOM helper 调用
- 动态绑定只更新对应 DOM 点位
- runtime cleanup 能为后续 `Show` / `For` / Web Components 生命周期服务

---

## 1. 当前判断

### 1.1 已经具备的基础

仓库中已有这些基础：

- `packages/signal`：已有 effect、computed、effectScope 等响应式能力。
- `packages/runtime-dom`：已有最小 DOM helper：
  - `template`
  - `insert`
  - `createComponent`
  - `setAttr`
- `packages/compiler`：已有 Babel JSX transform 雏形。
- `packages/compiler/src/ir`：已有初步 IR 类型。
- `packages/compiler/__tests__/jsx.spec.ts`：已有 JSX 编译快照测试。

### 1.2 当前主要缺口

当前最核心的问题是：编译器可以输出 DOM helper 调用，但这些调用还没有形成稳定的响应式绑定模型。

具体缺口：

1. `runtime-dom` 只有一次性 `insert`，没有 `bindText` / `bindAttr` / `bindEvent` / `render`。
2. 动态表达式目前被插入到父节点中，后续需要升级为稳定锚点或绑定点。
3. `transformChildren` 的静态节点索引逻辑存在问题：动态 child 不应该推进静态 DOM child index。
4. 对外公共 API 目前更接近 Vue-style `ref/effect`，还没有对齐 AGENTS.md 中推荐的 MVP API：
   - `createSignal`
   - `createMemo`
   - `createEffect`
   - `createRoot`
   - `onCleanup`
   - `batch`

---

## 2. 阶段目标

### 2.1 本阶段名称

`MVP-1.5 runtime-dom/compiler binding closure`

### 2.2 本阶段完成线

完成后，下面这个组件应该可以编译并运行：

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

并且满足：

- `Counter` 函数只执行一次。
- 点击按钮后，只更新按钮内部文本节点。
- 不创建 VNode。
- 不 diff 组件树。
- 事件监听能随 root dispose 清理。

---

## 3. 推荐实施顺序

### Step 1：修复 compiler 静态节点索引

文件：

- `packages/compiler/src/transform/children.ts`
- `packages/compiler/__tests__/jsx.spec.ts`
- `packages/compiler/__tests__/__snapshots__/jsx.spec.ts.snap`

问题：

动态 child 不会出现在静态 HTML template 中，因此不应该推进静态 child index。

当前错误模型：

```tsx
<div>
  {props.name}
  <span />
</div>
```

静态 template 是：

```html
<div><span></span></div>
```

因此 `<span>` 仍然是 `div.firstChild`，而不是 `div.nextSibling`。

建议改动：

```ts
// packages/compiler/src/transform/children.ts

// 原逻辑中 dynamic child 会 childIndex++。
// 修复原则：
// - element child 推进 staticChildIndex
// - dynamic child 不推进 staticChildIndex
// - text child 如果进入 template，才推进对应 DOM 定位

if (transformed.kind === 'dynamic') {
  results.exprs.push(
    t.expressionStatement(
      t.callExpression(
        registerImportMethod(
          child,
          'insert',
          getRendererConfig(child, 'dom').moduleName,
        ),
        [results.id, transformed.expr],
      ),
    ),
  )

  // 不要 childIndex++。
  // dynamic child 当前不属于静态 template DOM。
  return
}
```

更推荐把变量名从 `childIndex` 改成 `staticChildIndex`，减少误用：

```ts
let staticChildIndex = 0

// ...

if (isElementResult(transformed)) {
  results.declarations.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(
        transformed.id,
        t.memberExpression(
          results.id,
          t.identifier(staticChildIndex === 0 ? 'firstChild' : 'nextSibling'),
        ),
      ),
    ]),
  )
  staticChildIndex++
  return
}
```

验收：

```bash
pnpm test -- --run packages/compiler/__tests__/jsx.spec.ts
```

---

### Step 2：给 runtime-dom 增加最小响应式绑定

文件：

- `packages/runtime-dom/src/index.ts`
- 后续可拆为：
  - `template.ts`
  - `insert.ts`
  - `text.ts`
  - `attr.ts`
  - `event.ts`
  - `render.ts`

第一阶段可以先保持单文件，避免过早拆散。

建议新增 API：

```ts
export type Accessor<T> = () => T

export function bindText(node: Text, value: Accessor<JSXValue>): void
export function bindAttr(el: Element, name: string, value: Accessor<AttrValue>): void
export function bindEvent<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  name: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void
export function render(value: () => JSXValue, container: Element): () => void
```

建议代码草案：

```ts
// packages/runtime-dom/src/index.ts

import { effect, effectScope, onScopeDispose } from '@zeus-js/signal'

export type JSXValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Node
  | JSXValue[]

export type Component<
  P extends Record<string, unknown> = Record<string, unknown>,
> = (props: P) => JSXValue

export type TemplateFactory<T extends Node = Node> = () => T
export type AttrValue = string | number | boolean | null | undefined
export type Accessor<T> = () => T

export function template<T extends Node = Node>(
  html: string,
): TemplateFactory<T> {
  const t = document.createElement('template')
  t.innerHTML = html

  return function clone(): T {
    return t.content.firstChild!.cloneNode(true) as T
  }
}

export function insert(
  parent: Node,
  value: JSXValue,
  marker: Node | null = null,
): void {
  if (value == null || value === false || value === true) return

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      insert(parent, value[i], marker)
    }
    return
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  parent.insertBefore(node, marker)
}

export function createComponent<
  P extends Record<string, unknown>,
  R extends JSXValue,
>(component: (props: P) => R, props: P): R {
  return component(props)
}

export function setAttr(el: Element, name: string, value: AttrValue): void {
  const attrName = name === 'className' ? 'class' : name

  if (value == null || value === false) {
    el.removeAttribute(attrName)
    return
  }

  if (value === true) {
    el.setAttribute(attrName, '')
    return
  }

  el.setAttribute(attrName, String(value))
}

export function bindText(node: Text, value: Accessor<JSXValue>): void {
  let current = ''

  effect(() => {
    const nextValue = value()
    const next =
      nextValue == null || nextValue === false || nextValue === true
        ? ''
        : String(nextValue)

    if (next !== current) {
      current = next
      node.data = next
    }
  })
}

export function bindAttr(
  el: Element,
  name: string,
  value: Accessor<AttrValue>,
): void {
  let initialized = false
  let current: AttrValue

  effect(() => {
    const next = value()

    if (initialized && Object.is(next, current)) return

    initialized = true
    current = next
    setAttr(el, name, next)
  })
}

export function bindEvent<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  name: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void {
  el.addEventListener(name, handler as EventListener)

  onScopeDispose(() => {
    el.removeEventListener(name, handler as EventListener)
  })
}

export function render(value: () => JSXValue, container: Element): () => void {
  const scope = effectScope()

  scope.run(() => {
    const result = value()
    insert(container, result)
  })

  return () => {
    scope.stop()
    container.textContent = ''
  }
}
```

注意：

- 这份代码是 MVP 草案。
- `insert` 仍然是一次性插入，不负责更新动态 children。
- `bindText` 先只支持绑定到已知 `Text` 节点。
- 动态 JSX child 的完整更新需要 Step 3 的编译器配合。

---

### Step 3：让动态文本生成稳定 Text 绑定点

文件：

- `packages/compiler/src/transform/children.ts`
- `packages/compiler/src/codegen/template.ts`
- `packages/compiler/src/codegen/support/imports.ts`
- `packages/runtime-dom/src/index.ts`

当前输出大致是：

```ts
_insert(_el$, props.name)
```

目标输出应逐步演进为：

```ts
const _text$ = document.createTextNode('')
_insert(_el$, _text$)
_bindText(_text$, () => props.name)
```

对于：

```tsx
const App = props => <div>Hello {props.name}</div>
```

第一版可接受输出：

```ts
import {
  bindText as _bindText,
  insert as _insert,
  template as _template,
} from '@zeus-js/runtime-dom'

var _tmpl$ = /*#__PURE__*/ _template(`<div>Hello </div>`)

const App = props =>
  (() => {
    const _el$ = _tmpl$().firstChild
    const _text$ = document.createTextNode('')

    _insert(_el$, _text$)
    _bindText(_text$, () => props.name)

    return _el$
  })()
```

该方案简单直接，缺点是动态文本总是 append 到父节点末尾。它只能暂时覆盖动态 child 在尾部的场景。

更正确的方案是引入 comment marker：

```ts
var _tmpl$ = /*#__PURE__*/ _template(`<div>Hello <!></div>`)
```

运行期：

```ts
const _marker$ = findMarker(_el$, 0)
const _text$ = document.createTextNode('')

_insert(_el$, _text$, _marker$)
_bindText(_text$, () => props.name)
```

对应 runtime helper：

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

推荐策略：

1. 先实现尾部动态文本绑定，快速证明细粒度更新。
2. 再升级为 comment marker，解决任意位置动态 child。

---

### Step 4：补 DOM runtime 测试

新增文件：

- `packages/runtime-dom/__tests__/binding.spec.ts`

建议测试代码：

```ts
// packages/runtime-dom/__tests__/binding.spec.ts

import { describe, expect, it, vi } from 'vitest'

import { ref } from '@zeus-js/signal'
import {
  bindAttr,
  bindEvent,
  bindText,
  render,
  template,
} from '../src'

describe('runtime-dom bindings', () => {
  it('binds text to reactive source', () => {
    const count = ref(0)
    const node = document.createTextNode('')

    bindText(node, () => count.value)

    expect(node.data).toBe('0')

    count.value++

    expect(node.data).toBe('1')
  })

  it('binds attribute to reactive source', () => {
    const title = ref('hello')
    const el = document.createElement('div')

    bindAttr(el, 'title', () => title.value)

    expect(el.getAttribute('title')).toBe('hello')

    title.value = 'world'

    expect(el.getAttribute('title')).toBe('world')
  })

  it('removes nullable and false attributes', () => {
    const disabled = ref<true | false | null>(true)
    const el = document.createElement('button')

    bindAttr(el, 'disabled', () => disabled.value)

    expect(el.hasAttribute('disabled')).toBe(true)

    disabled.value = false

    expect(el.hasAttribute('disabled')).toBe(false)
  })

  it('binds event listener', () => {
    const el = document.createElement('button')
    const onClick = vi.fn()

    bindEvent(el, 'click', onClick)
    el.click()

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders a template into a container', () => {
    const root = document.createElement('div')
    const tmpl = template<Element>('<button>hello</button>')

    const dispose = render(() => tmpl(), root)

    expect(root.innerHTML).toBe('<button>hello</button>')

    dispose()

    expect(root.innerHTML).toBe('')
  })
})
```

验收：

```bash
pnpm test -- --run packages/runtime-dom/__tests__/binding.spec.ts
```

---

### Step 5：补 compiler 到 runtime 的集成测试

新增文件：

- `packages/compiler/__tests__/runtime.spec.ts`

目的：

验证编译产物不只是快照正确，而是真的能在 jsdom 中运行。

建议测试方向：

```ts
// packages/compiler/__tests__/runtime.spec.ts

import { transformAsync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import zeus from '../src'

async function compile(code: string) {
  const result = await transformAsync(code, {
    filename: 'test.tsx',
    plugins: [zeus],
    parserOpts: {
      plugins: ['typescript', 'jsx'],
    },
    generatorOpts: {
      retainLines: false,
      compact: false,
      jsescOption: {
        minimal: true,
      },
    },
  })

  return result?.code?.trim() ?? ''
}

describe('compiler runtime integration', () => {
  it('compiles static element to runnable DOM code', async () => {
    const output = await compile(`
      export const App = () => <div>hello</div>
    `)

    expect(output).toContain('_template(`<div>hello</div>`)')
  })

  it('compiles dynamic text to binding helper', async () => {
    const output = await compile(`
      export const App = (props: { name: string }) => <div>{props.name}</div>
    `)

    expect(output).toContain('bindText')
  })
})
```

这组测试初期可以先验证编译输出结构。等代码生成稳定后，再用 `new Function` 或独立 fixture 运行编译产物。

---

## 4. 对外 API 对齐计划

AGENTS.md 要求 MVP 公共响应式 API 是：

```ts
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)
createEffect(() => {
  console.log(count())
})
```

当前 `packages/zeus/src/index.ts` 主要导出 `ref` / `computed` / `effect`。

推荐新增兼容层，不要直接暴露内部响应式实现细节。

文件：

- `packages/zeus/src/reactive.ts`
- `packages/zeus/src/index.ts`

建议代码：

```ts
// packages/zeus/src/reactive.ts

import {
  computed,
  effect,
  effectScope,
  onEffectCleanup,
  ref,
} from '@zeus-js/signal'

export type Accessor<T> = () => T
export type Setter<T> = (value: T | ((prev: T) => T)) => T

export function createSignal<T>(initial: T): [Accessor<T>, Setter<T>] {
  const source = ref(initial)

  const get = () => source.value as T
  const set: Setter<T> = value => {
    const next =
      typeof value === 'function'
        ? (value as (prev: T) => T)(source.value as T)
        : value

    source.value = next
    return next
  }

  return [get, set]
}

export function createMemo<T>(fn: () => T): Accessor<T> {
  const memo = computed(fn)
  return () => memo.value
}

export function createEffect(fn: () => void): void {
  effect(fn)
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const scope = effectScope()
  let result!: T

  scope.run(() => {
    result = fn(() => scope.stop())
  })

  return result
}

export function onCleanup(fn: () => void): void {
  onEffectCleanup(fn)
}

export function batch<T>(fn: () => T): T {
  return fn()
}
```

入口导出：

```ts
// packages/zeus/src/index.ts

export {
  createSignal,
  createMemo,
  createEffect,
  createRoot,
  onCleanup,
  batch,
} from './reactive'
```

注意：

- `batch` 第一版可以是同步透传。
- 后续如果 `@zeus-js/signal` 提供批处理调度，再替换内部实现。
- `onCleanup` 的最终语义应同时支持 owner cleanup，不应永久绑定到 effect cleanup。

---

## 5. 最小 Counter 的目标编译输出

输入：

```tsx
import { createSignal } from 'zeus'

export function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <button class="counter" onClick={() => setCount(count() + 1)}>
      count: {count()}
    </button>
  )
}
```

短期目标输出：

```ts
import {
  bindEvent as _bindEvent,
  bindText as _bindText,
  insert as _insert,
  template as _template,
} from '@zeus-js/runtime-dom'
import { createSignal } from 'zeus'

var _tmpl$ = /*#__PURE__*/ _template(`<button class="counter">count: </button>`)

export function Counter() {
  const [count, setCount] = createSignal(0)

  return (() => {
    const _el$ = _tmpl$().firstChild
    const _text$ = document.createTextNode('')

    _insert(_el$, _text$)
    _bindText(_text$, () => count())
    _bindEvent(_el$, 'click', () => setCount(count() + 1))

    return _el$
  })()
}
```

中期目标输出：

```ts
import {
  bindEvent as _bindEvent,
  bindText as _bindText,
  marker as _marker,
  template as _template,
} from '@zeus-js/runtime-dom'
import { createSignal } from 'zeus'

var _tmpl$ = /*#__PURE__*/ _template(
  `<button class="counter">count: <!></button>`,
)

export function Counter() {
  const [count, setCount] = createSignal(0)

  return (() => {
    const _el$ = _tmpl$().firstChild
    const _marker$ = _marker(_el$, 0)
    const _text$ = document.createTextNode('')

    _el$.insertBefore(_text$, _marker$)
    _bindText(_text$, () => count())
    _bindEvent(_el$, 'click', () => setCount(count() + 1))

    return _el$
  })()
}
```

---

## 6. 详细任务拆分

### 任务 A：修复 compiler 静态 child 定位

范围：

- 修改 `transformChildren`
- 更新快照
- 加至少两个定位测试

测试用例：

```tsx
<div>{a}<span /></div>
<div><span />{a}<b /></div>
<div>{a}{b}<span /></div>
```

验收：

- 静态元素定位不受动态表达式数量影响。
- 快照稳定。

---

### 任务 B：runtime-dom binding MVP

范围：

- `bindText`
- `bindAttr`
- `bindEvent`
- `render`

验收：

- 文本响应式更新。
- attribute 响应式更新。
- boolean/null attribute 正确移除。
- event listener 能触发。
- `render` 返回 dispose。

---

### 任务 C：Zeus public reactive facade

范围：

- 新增 `packages/zeus/src/reactive.ts`
- 从 `packages/zeus/src/index.ts` 导出显式 API

验收：

```ts
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)

createEffect(() => {
  doubled()
})

setCount(1)
setCount(prev => prev + 1)
```

---

### 任务 D：compiler 生成 `bindText`

范围：

- 动态文本 child 改成创建 `Text` 节点
- 插入 text 节点
- 调用 `bindText`
- 自动导入 `bindText`

验收：

快照中出现：

```ts
const _text$ = document.createTextNode('')
_bindText(_text$, () => props.name)
```

---

### 任务 E：事件属性编译到 `bindEvent`

范围：

- 识别 `onClick`
- 转成 `click`
- 输出 `bindEvent`

输入：

```tsx
<button onClick={handleClick}>click</button>
```

目标输出：

```ts
_bindEvent(_el$, 'click', handleClick)
```

验收：

- `onClick`
- `onInput`
- `onChange`

第一版不做事件代理。

---

### 任务 F：动态 attribute 编译到 `bindAttr`

范围：

- `className={expr}`
- `id={expr}`
- `title={expr}`
- `disabled={expr}`

输入：

```tsx
<button disabled={props.disabled} title={props.title} />
```

目标输出：

```ts
_bindAttr(_el$, 'disabled', () => props.disabled)
_bindAttr(_el$, 'title', () => props.title)
```

验收：

- `null` / `undefined` / `false` 移除 attribute。
- `true` 输出空字符串 attribute。
- `className` 映射为 `class`。

---

## 7. 不在本阶段做的事

这些能力先不要混入本阶段：

- `Show`
- `For`
- keyed reconciliation
- Web Components
- Light DOM slot projection
- Vite plugin
- SSR / hydration
- 事件代理
- 深层响应式语法糖
- 对普通 `let` 的响应式改写

原因：

这些能力都依赖一个前提：runtime-dom 与 compiler 的绑定模型已经稳定。

---

## 8. 推荐提交顺序

建议拆成 5 个小提交：

```txt
fix(compiler): correct static child indexing around dynamic children
feat(runtime-dom): add minimal text attr event bindings
feat(zeus): add signal-style public reactive facade
feat(compiler): emit text binding for dynamic text children
feat(compiler): emit event and attribute bindings
```

---

## 9. 验收命令

每个任务完成后至少运行：

```bash
pnpm test -- --run packages/compiler/__tests__/jsx.spec.ts
pnpm test -- --run packages/runtime-dom/__tests__/binding.spec.ts
pnpm test -- --run packages/signal/__tests__/effect.spec.ts packages/signal/__tests__/computed.spec.ts packages/signal/__tests__/effectScope.spec.ts
```

最终运行：

```bash
pnpm test -- --run
pnpm check
```

---

## 10. 最终完成标志

本阶段真正完成时，应能给出一个最小 demo：

```tsx
import { createSignal, render } from 'zeus'

function Counter() {
  const [count, setCount] = createSignal(0)

  return (
    <button onClick={() => setCount(count() + 1)}>
      count: {count()}
    </button>
  )
}

render(() => <Counter />, document.getElementById('app')!)
```

并观察到：

- 首次渲染创建 DOM。
- 点击按钮后文本变化。
- `Counter` 不重新执行。
- DOM 中没有 VNode 中间结构。
- dispose 后 effect 与事件监听被释放。

这就是 Zeus 从“有编译器雏形”进入“核心架构被运行时证明”的分界线。
