我扫完 `feat/signal` 分支后，建议把 Zeus 规划成 **7 个 Phase**。当前项目已经不是单纯 signal 包了，更像是一个「SolidJS 风格 JSX 编译框架」的雏形：`@zeus-js/signal`、`@zeus-js/compiler`、`@zeus-js/runtime-dom`、`@zeus-js/shared` 已经出现，pnpm workspace 也覆盖了 `packages/*` 和 `playground/*`。

## 当前项目判断

现在的完成度大概是：

**signal 层比较完整，runtime/compiler 还在 MVP 早中期。**

`@zeus-js/signal` 已经包含 `ref / reactive / computed / effect / watch / effectScope / readonly / shallowReactive / customRef` 等一套偏 Vue Reactivity 的 API，并且 signal 包依赖了 `alien-signals`。

compiler 已经有 Babel 插件入口，流程是：

```txt
JSX AST
  -> lowerJSX
  -> normalizeChildren
  -> validateBuiltins
  -> assignDomPaths
  -> analyzeBindings
  -> collectTemplates
  -> emitDOM
```

这个方向是对的，已经有 IR / pass / codegen 的雏形，不是随手写 transform。

runtime-dom 目前提供了 `template / insert / bindText / bindAttr / bindProp / bindEvent / mountShow / mountFor / render / defineElement` 等基础能力，已经能支撑静态模板、动态文本、基础属性绑定、组件调用、Show/For。

但有几个明显缺口：

1. README 仍然把项目描述为“轻量级响应式信号系统”，还没升级成框架级定位。
2. `runtime-dom` 的 package 目前没有 `buildOptions`，而根构建脚本只会构建有 `buildOptions` 的 packages，所以 root `pnpm build` 可能不会统一构建 runtime-dom。
3. compiler 的事件 support 里有 `delegateEvents` 注入逻辑，但 runtime-dom 当前只看到 `bindEvent`，没看到 `delegateEvents` 实现，后面要补齐或删除这条路径。
4. compiler 测试已有 JSX snapshot，但覆盖还偏基础，主要是静态元素、动态文本、组件、嵌套组件、Show。

---

# Zeus 整体规划：7 个 Phase

## Phase 0：项目定位与工程基线

**目标：先把 Zeus 从“signal 包”升级成“可维护的框架工程”。**

这一阶段不急着写功能，先统一项目边界。

要做：

1. 更新 README 定位：

```txt
Zeus = compiler-first fine-grained UI framework
核心目标：
- JSX DX
- 无 Virtual DOM
- 编译期模板提升
- signal 驱动的细粒度更新
- Web Components / Host / Slot 支持
```

2. 统一 packages 定位：

```txt
packages/
  shared        # 工具函数
  signal        # 响应式核心
  runtime-dom   # DOM 运行时
  compiler      # JSX 编译器
  babel-plugin  # 可选，后面拆
  vite-plugin   # 后面补
```

3. 修复构建体系：

当前 root build 依赖 `buildOptions` 识别目标包，`signal/shared/compiler` 有，`runtime-dom` 没有。建议二选一：

```txt
方案 A：runtime-dom 也接入 rolldown buildOptions
方案 B：root build 支持 package scripts build
```

我更建议 **方案 A**，所有核心包统一走一套 build 体系。

4. 统一测试命名：

```txt
packages/signal/__tests__
packages/compiler/__tests__
packages/runtime-dom/__tests__
```

当前 Vitest 已经会扫 `packages/**/*.{test,spec}.{ts,tsx}`，这个设计可以继续用。

**Phase 0 交付物：**

```txt
- README 新定位
- packages 分层说明
- root build 可构建 shared/signal/runtime-dom/compiler
- pnpm check / pnpm test / pnpm build 全部稳定
```

---

## Phase 1：Signal Core 稳定化

**目标：把响应式核心打磨成框架的可信底座。**

当前 signal 已经很像 Vue Reactivity，API 面挺全：`ref/reactive/computed/effect/watch/effectScope` 都有。接下来不要继续扩 API，应该先稳定行为和测试。

要做：

### 1. 明确 Zeus 自己的响应式 API 风格

现在 API 更偏 Vue：

```ts
ref()
reactive()
computed()
effect()
watch()
```

但你之前想做的是 SolidJS 风格框架，后面要决定是否暴露：

```ts
createSignal()
createMemo()
createEffect()
createRoot()
onCleanup()
batch()
untrack()
```

我的建议是：

```txt
内部底层：继续保留 Vue-like core
对外框架层：暴露 Solid-like API
```

也就是：

```ts
// low-level
import { ref, reactive, effect } from '@zeus-js/signal'

// framework DX
import { createSignal, createEffect, createMemo } from 'zeus'
```

这样既不浪费当前实现，也更符合你做 JSX 框架的目标。

### 2. 补齐核心行为测试

重点补：

```txt
effect 嵌套
effect stop
effect cleanup
computed lazy/cache
computed 链式依赖
batch
watch immediate/deep/flush
effectScope 嵌套释放
Map / Set / WeakMap / WeakSet
array length / index / iteration
readonly / shallowReadonly
```

当前 dep/effect 已经用了 `Dep + Link + doubly linked list + globalVersion` 的结构，属于性能意识比较强的实现，后续测试必须覆盖这些复杂场景。

### 3. 决定是否真的依赖 alien-signals

现在 package 声明依赖了 `alien-signals`，但当前源码又有一套自己的 `Dep / ReactiveEffect / computed`。

这里要尽快做架构决策：

```txt
路线 A：完全自研 signal core
路线 B：基于 alien-signals 封装
路线 C：Vue-like reactive 对象 + alien-signals primitive 混合
```

我建议短期用 **路线 A**，因为你现在代码已经基本成型。alien-signals 可以留作 benchmark 和参考，不要在底层混用两套响应式模型。

**Phase 1 交付物：**

```txt
- signal API 文档
- createSignal/createEffect/createMemo 适配层
- signal 行为测试覆盖率提升
- 明确是否移除 alien-signals 依赖
```

---

## Phase 2：Runtime DOM MVP

**目标：不用 compiler，也能手写 runtime API 跑起来。**

当前 runtime-dom 已经有基础能力，但还偏“给 compiler 生成代码用”。Phase 2 要把它变成可靠 DOM runtime。

要做：

### 1. 完善 DOM 插入与动态更新

当前 `insert()` 是一次性插入；`mountDynamic()` 会清空旧节点再插入新节点，能跑，但还不够细。

短期可以接受“全量替换”，但要封装成清晰模型：

```ts
createTextBinding()
createDynamicBinding()
createArrayBinding()
disposeNodeRange()
```

后面再做列表 diff。

### 2. 补齐事件系统

现在 compiler support 有 `delegateEvents`，runtime 却只有 `bindEvent`。建议先别上复杂代理，先两步走：

```txt
2.1 bindEvent 直接 addEventListener，保证正确
2.2 实现 delegateEvents，作为优化路径
```

runtime 要新增：

```ts
export function delegateEvents(events: string[]): void
```

如果 compiler 暂时没有真的用委托，就把 appendEvents 暂时关掉，避免生成不存在的 runtime import。

### 3. 属性 / DOM property 规则

当前有：

```ts
setAttr()
bindAttr()
bindProp()
```

下一步要补：

```txt
class / className
style object
boolean attr
value / checked / selected
dataset
aria-*
prop:xxx
onXxx
```

### 4. render 生命周期

当前 `render()` 返回 dispose，内部用 `effectScope` 管控。这个方向是对的。

要补：

```txt
createRoot
onMount
onCleanup
dispose
错误边界暂时不做
```

**Phase 2 交付物：**

```txt
- runtime-dom 单测
- render/dispose 稳定
- bindText/bindAttr/bindProp/bindEvent 全覆盖
- delegateEvents 决策落地
```

---

## Phase 3：Compiler MVP 闭环

**目标：JSX 编译产物可以稳定驱动 runtime-dom，形成真正框架闭环。**

当前 compiler 的架构已经有雏形，比较好的点是已经分了：

```txt
lower
passes
codegen
support
context
ir
```

IR 里已经有：

```txt
Element
Text
DynamicText
Component
Fragment
Show
For
Host
Slot
AttrBinding
PropBinding
EventBinding
```

这说明你不是只做 JSX to h()，而是走 compiler-first 路线。

Phase 3 重点不是大改架构，而是补齐语义。

要做：

### 1. JSX 基础语义补齐

```txt
Fragment
nested fragment
JSX expression
conditional expression
logical expression
array children
null / false / true
text whitespace normalize
spread attributes
class / className
style object
```

当前 spread attribute 直接报错，MVP 可以先报错，但正式可用前必须支持。

### 2. Component props 语义

要明确：

```tsx
<MyComp title="hello" count={count()} />
<MyComp>{children}</MyComp>
<MyComp foo={<div />} />
```

后续 props 应该是：

```ts
createComponent(MyComp, {
  title: "hello",
  get count() { return count() },
  children: ...
})
```

否则动态 props 的响应性会不够自然。

### 3. Built-in 组件稳定

当前支持：

```tsx
<Show when={cond}>...</Show>
<For each={list}>{(item, index) => ...}</For>
<Host />
<Slot />
```

lowerBuiltin 已经有这些分支。

建议 Phase 3 只稳定：

```txt
Show
For
Fragment
Component
```

`Host / Slot` 先放到 Web Components 阶段。

### 4. 编译产物质量

目标产物风格：

```ts
const _tmpl$ = template(`<div><!></div>`)

const App = props => {
  const _el$ = _tmpl$().firstChild
  const _text$ = document.createTextNode("")
  insert(...)
  bindText(...)
  return _el$
}
```

你当前 snapshot 已经是这个方向。

要继续优化：

```txt
静态模板提升
template dedupe
DOM path 稳定
无用 child ref 消除
import 顺序整理
开发模式 warning
source map
```

**Phase 3 交付物：**

```txt
- compiler JSX MVP 测试覆盖
- playground 能写 App.tsx
- 静态模板 + 动态文本 + 组件 + Show + For 能跑
- 生成代码无明显 runtime 缺失
```

---

## Phase 4：框架入口与 Vite 插件

**目标：用户可以像使用一个框架一样启动项目，而不是手动接 Babel 插件。**

这一阶段要从“包”变成“可用框架”。

新增：

```txt
packages/zeus
packages/vite-plugin-zeus
```

### 1. 框架主入口

```ts
// zeus
export {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  For,
  Show,
  render,
} from ...
```

建议使用：

```ts
import { render, createSignal } from 'zeus'
```

而不是让用户分别从：

```ts
@zeus-js/signal
@zeus-js/runtime-dom
```

导入。

### 2. Vite 插件

```ts
import zeus from '@zeus-js/vite-plugin'

export default defineConfig({
  plugins: [zeus()],
})
```

插件职责：

```txt
- 对 .tsx/.jsx 执行 @zeus-js/compiler
- 注入 jsxImportSource
- dev sourcemap
- HMR 基础支持
```

### 3. JSX 类型

补：

```txt
packages/runtime-dom/jsx-runtime
packages/runtime-dom/jsx-dev-runtime
global JSX namespace
IntrinsicElements
```

否则 TSX 项目体验会很差。

**Phase 4 交付物：**

```txt
- create-zeus-app 可选
- vite-plugin-zeus
- examples/counter
- examples/todo
- TSX 类型能正常提示
```

---

## Phase 5：Web Components / Host / Slot

**目标：实现你之前想做的 Host 内建组件，编译到 Web Components，并支持 light DOM slot。**

当前 runtime-dom 已经有 `defineElement()`，支持：

```ts
defineElement(tagName, options, setup)
```

并且内部已经处理 attribute -> prop 的转换。

compiler IR 也已经有 `HostIR / SlotIR`。

这一阶段就是把它们串起来。

建议语法：

```tsx
export const MyCard = defineComponent(() => {
  return (
    <Host tag="my-card">
      <div class="card">
        <Slot />
      </div>
    </Host>
  )
})
```

或者更直接：

```tsx
defineElement('my-card', () => (
  <Host>
    <div>
      <Slot />
    </div>
  </Host>
))
```

要做：

```txt
Host 编译规则
Slot fallback 编译规则
light DOM / shadow DOM 策略
attribute -> prop
prop -> reactive state
自定义事件 emit
生命周期 connected/disconnected
```

建议先支持：

```txt
shadow: false
默认 light DOM
Slot 先用原生 slot 或手动 fallback
```

不要一开始就把 Shadow DOM、Context、Slot 分发、CSS 隔离全做完。

**Phase 5 交付物：**

```txt
- defineElement 稳定
- <Host> / <Slot> 编译可用
- examples/web-component
- 支持在原生 HTML 中使用 Zeus 组件
```

---

## Phase 6：性能优化与高级能力

**目标：从“能用”变成“有框架特点”。**

这一阶段才开始做性能。

### 1. 编译器优化

```txt
静态节点最大化提升
事件委托
纯静态子树复用
动态表达式最小绑定
DOM path 优化
布尔条件智能编译
For 列表 keyed diff
```

### 2. runtime 优化

```txt
insert array diff
range marker
dispose tree
事件委托
style/class 快路径
textContent 快路径
```

### 3. signal 优化

```txt
batch public API
untrack
selector
resource/createAsync
transition 暂缓
```

### 4. benchmark

对比对象：

```txt
SolidJS
Vue petite reactivity + runtime
Preact signals
Svelte
```

先测：

```txt
counter
large table
list insert/remove/swap
nested computed
memory cleanup
```

**Phase 6 交付物：**

```txt
- benchmark suite
- runtime diff 优化
- 编译产物 size report
- signal memory leak 测试
```

---

## Phase 7：生态化与发布

**目标：可发布、可被别人试用。**

要做：

```txt
文档站
API reference
playground
examples
npm 发布
版本策略
贡献指南
roadmap
```

包结构建议：

```txt
zeus
@zeus-js/signal
@zeus-js/runtime-dom
@zeus-js/compiler
@zeus-js/vite-plugin
@zeus-js/shared
```

发布顺序：

```txt
0.0.x internal preview
0.1.0 compiler/runtime MVP
0.2.0 Vite plugin + TSX DX
0.3.0 Web Components
0.4.0 performance pass
1.0.0 API freeze
```

---

# 最推荐的阶段顺序

我建议你按这个优先级做：

```txt
Phase 0：工程基线
Phase 1：Signal Core 稳定
Phase 2：Runtime DOM MVP
Phase 3：Compiler MVP 闭环
Phase 4：Vite 插件 + 框架入口
Phase 5：Web Components / Host / Slot
Phase 6：性能优化
Phase 7：文档、生态、发布
```

不要先做性能，不要先做 Web Components。现在最关键的是先形成这个闭环：

```tsx
const App = () => {
  const count = createSignal(0)

  return (
    <button onClick={() => count.set(count() + 1)}>count: {count()}</button>
  )
}

render(() => <App />, document.getElementById('root')!)
```

也就是：

```txt
signal API 可用
        ↓
compiler 能识别 JSX
        ↓
生成 runtime-dom 调用
        ↓
DOM 细粒度更新
        ↓
Vite 项目能启动
```

这个闭环跑通后，Zeus 才算从“响应式实验”进入“框架雏形”。
