可以，下面我直接给你一版 **Zeus 的 MVP 路线**，按“先做什么、为什么先做、做到什么算完成”来排。

---

# Zeus MVP 路线

## 总目标

先做出一个 **可用、可编译、可验证性能模型** 的最小框架，而不是一开始追求全家桶。

MVP 的判断标准不是功能多，而是这条链必须打通：

**TSX -> 编译器 -> Zeus IR -> DOM runtime -> 细粒度更新**

并且能证明这几点：

1. 组件初始化后**不重复执行**
2. 状态变化时只更新**精确 DOM 节点**
3. 控制流和列表能正常挂载/卸载
4. Web Components 至少 Shadow 模式可跑通
5. 后续可以继续演进到 light DOM slot、Rust 编译器

---

# 阶段 0：冻结设计边界

这一步不重代码，重决策。

## 要定下来的事

### 1. 响应式语义

先确定 Zeus 的真实语义是：

- 底层依赖 **alien-signal**
- 对外 API 不直接暴露 alien-signal
- Zeus 自己提供：
  - `createSignal`
  - `createMemo`
  - `createEffect`
  - `createRoot`
  - `onCleanup`
  - `batch`

### 2. 更新模型

明确：

- 组件函数只在初始化时执行
- 后续更新不 rerender 组件
- DOM 更新由 signal/effect 驱动

### 3. JSX 编译范围

MVP 只支持：

- 原生 DOM 标签
- 普通组件
- 文本插值
- 动态属性
- 事件
- Fragment
- `Show`
- `For`

### 4. Web Components 策略

先只定两件事：

- Zeus 组件支持编译为 Custom Element
- `Host` / `Slot` 是编译期内置节点，不是普通组件

### 5. 非目标

MVP 明确不做：

- SSR
- hydration
- router
- store 全家桶
- suspense/resource
- 激进响应式语法糖
- Rust 编译器正式版

## 完成标准

产出一份内部 RFC 或 AGENT 规范即可。
做到“后面写代码不会反复推翻前提”就够了。

---

# 阶段 1：响应式核心最小闭环

这是最先要做的代码层。

## 要实现的能力

- `createSignal`
- `createMemo`
- `createEffect`
- `createRoot`
- `onCleanup`
- `batch`
- owner/scope
- dispose 机制

## 为什么先做这个

因为没有这层，后面的 DOM 绑定、Show/For、Web Components cleanup 都不成立。

尤其是这几个点必须一开始就有：

- effect 依赖追踪
- cleanup 注册
- 子作用域释放
- 条件分支切换时可正确 dispose

## 这一阶段先别做的事

- 异步调度器
- transition
- 复杂 resource
- devtools

## 完成标准

手写不用编译器，能跑这种代码：

```tsx
const [count, setCount] = createSignal(0)
createEffect(() => {
  console.log(count())
})
```

并且：

- set 后 effect 正确重新执行
- cleanup 能触发
- root dispose 后不再更新

---

# 阶段 2：runtime-dom 最小可用版

这一步开始让响应式真正落到 DOM。

## 要实现的 helper

- `createTemplate`
- `getNode`
- `bindText`
- `bindAttr`
- `bindProp`
- `bindEvent`
- `render`
- 基础 ref
- comment/text placeholder

## 目标

先实现“**最小的精确 DOM 更新**”。

比如：

```tsx
<button>{count()}</button>
```

在运行时应该变成：

- 静态模板只创建一次
- 文本节点单独绑定
- count 变化只更新这个文本节点

## 为什么这是第二步

因为你要先证明 Zeus 的性能模型真的成立，而不是纸面概念。

## 完成标准

即使还没有 Babel 编译器，也可以手写 runtime helper 跑通：

- 文本更新
- 属性更新
- 事件触发
- root render

比如最简单 counter 能工作。

---

# 阶段 3：Babel 编译器打通第一条链路

这是 MVP 最核心的一步。

## 目标

把 TSX 编译成：

- 模板缓存
- DOM helper 调用
- 动态绑定代码

## 先支持的语法

只支持最基础的：

- 函数组件
- 原生 DOM 节点
- 静态属性
- 动态文本插值
- 动态 attr/prop
- 事件
- Fragment

## 先不支持的复杂语法

- 高级 children flatten
- 任意 JSX 数组表达式
- 复杂 spread props 优化
- 响应式 props 解构

## 关键产出

### 1. 组件识别

识别哪些函数是组件

### 2. JSX -> IR

不要直接 AST 转 helper，先做一层 Zeus IR

### 3. IR -> JS

统一 codegen 到 runtime helper

## 完成标准

下面这种组件能成功编译运行：

```tsx
function Counter() {
  const [count, setCount] = createSignal(0)

  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
```

并且满足：

- 组件不会 rerender
- 点击后只更新文本节点

---

# 阶段 4：控制流 Show / Fragment

这一步开始让框架“能写页面”。

## 要实现的能力

- `Show` 作为编译期内置节点
- comment anchor 区域
- 条件挂载/卸载
- 子树独立 scope
- fallback 可先延后，或做最简版

## 为什么先做 Show

因为它是最基本的结构控制能力，而且能逼你把 “区域 + cleanup” 做对。

## 技术重点

- `start/end` marker
- mount/unmount subtree
- subtree dispose
- 再次显示时重建 subtree

## 完成标准

这种代码能稳定工作：

```tsx
<Show when={visible()}>
  <div>{count()}</div>
</Show>
```

并且：

- visible 切换时 DOM 正确插入/删除
- 内部 effect 不泄漏

---

# 阶段 5：For 列表渲染

这一步 Zeus 就进入“能做实际 demo”的阶段。

## MVP 先支持

```tsx
<For each={items()}>{item => <li>{item.name}</li>}</For>
```

## 第一版策略

先追求 **正确**，再追求 **最优**。

### 先做

- 列表整体更新
- 子项单独 scope
- 删除项能 dispose

### 再升级

- keyed reconcile
- 节点复用
- 更少移动

## 为什么不要一开始就做复杂 diff

因为列表 diff 是容易把项目拖复杂的点。
MVP 需要的是先证明编译模型和生命周期是对的。

## 完成标准

Todo List 这种小 demo 可以正常：

- 新增
- 删除
- 重排
- 子项 effect 不泄漏

---

# 阶段 6：Vite 插件与开发体验最小闭环

这一步不提升框架本体能力，但决定“能不能开发”。

## 要做的事

- Vite 插件
- `.tsx` 编译接入
- runtime import 自动注入
- dev/prod 模式区分
- source map
- playground 示例

## 建议同时做的 warning

- `props` 解构响应式警告
- `Host` 非根节点报错
- `Slot` 出现在非法上下文报错
- `For` 无稳定 key 警告
- 某些不支持 children 结构警告

## 完成标准

可以直接：

```ts
import { defineConfig } from 'vite'
import zeus from '@zeus/vite-plugin'
```

然后跑通：

- counter
- todo
- show/for demo

---

# 阶段 7：Web Components MVP（先 Shadow DOM）

这是 Zeus 的第一个差异化版本点。

## 要支持的 API

- `defineElement`
- `Host`
- `Slot`
- `shadow: true | "open" | "closed"`
- `props` schema
- attr -> prop 反射
- `connectedCallback`
- `disconnectedCallback`

## 先做的范围

只做 Shadow DOM 模式：

```tsx
defineElement('z-card', { shadow: true }, () => {
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
})
```

## 为什么先做 Shadow

因为：

- 语义最标准
- 原生 slot 可直接利用
- 生命周期边界清楚
- 最容易验证 Zeus 编译模型能否和 Custom Elements 融合

## 完成标准

做到这几点就行：

- 自定义元素注册成功
- Shadow DOM 能正常挂载
- 外部 children 能投到 slot
- 属性变化能驱动内部更新
- 断开节点后 scope 正确 dispose

---

# 阶段 8：Light DOM slot 投影

这是增强版，不一定算最小 MVP，但很值得作为 **MVP+1**。

## 要做的事

当 `shadow: false` 时：

- `Slot` 不再编译成原生 `<slot>`
- Zeus 自己做内容投影
- 收集 host 原始 children
- 按 `slot` 名字分发
- 用 `MutationObserver` 监听 childList

## 为什么建议放在 Shadow 后面

因为 light DOM slot 不是浏览器原生能力，而是你自己实现一套 projection 语义，复杂度明显更高。

## 完成标准

下面这种能工作：

```html
<z-card>
  <h1 slot="header">Title</h1>
  <p>Body</p>
</z-card>
```

并且在 `shadow: false` 时：

- header 内容被分发到 header slot
- 默认内容进默认 slot
- children 变化后能重新分发

---

# 阶段 9：性能和编译优化

这一步是“把能跑变成更强”。

## 可以做的优化项

### 编译器侧

- 静态节点提升
- 更紧凑的 IR
- 更少 helper 调用
- 更好的节点定位方式
- 常量折叠
- 更细的静态/动态分析

### runtime 侧

- classList patch
- style object patch
- keyed list 优化
- 事件代理
- 更细粒度 region 更新

## 这一步不着急做的事

- 全面语法糖
- Rust 全量迁移
- SSR

---

# 推荐时间切法

如果按比较现实的节奏，我建议这样排：

## 第一阶段

**2 周**

- 阶段 0 + 1
- 冻结设计
- 核心响应式跑通

## 第二阶段

**2 周**

- 阶段 2 + 3
- runtime-dom + Babel 最小编译闭环

## 第三阶段

**1~2 周**

- 阶段 4 + 5
- Show / For / 列表 scope

## 第四阶段

**1 周**

- 阶段 6
- Vite 插件、playground、warning

## 第五阶段

**1~2 周**

- 阶段 7
- Web Components Shadow 模式

## 第六阶段

**1~2 周**

- 阶段 8
- Light DOM slot projection

也就是大致 **8~10 周** 能做出一个非常像样的 Zeus 初版。

---

# 我建议你实际定义的“MVP 完成线”

如果要严格一点，我会把 **MVP 完成线** 定在这里：

## 必须完成

- 响应式核心
- runtime-dom
- Babel 编译器
- Show / For
- Vite 插件
- 至少一个 Web Components Shadow demo

## 可以延后

- light DOM slot
- keyed list 最优版
- 语法糖
- Rust compiler
- SSR

也就是说：

**Shadow Web Components 做完，就可以对外说 Zeus 已有 MVP。**
**Light DOM slot 做完，就可以说 Zeus 有差异化能力。**

---

# 最后给你一个最务实的版本

如果你现在就准备开工，我建议按这个顺序写文件：

## 第 1 批

- `core/createSignal.ts`
- `core/createEffect.ts`
- `core/createRoot.ts`
- `core/cleanup.ts`

## 第 2 批

- `runtime-dom/template.ts`
- `runtime-dom/text.ts`
- `runtime-dom/attr.ts`
- `runtime-dom/event.ts`
- `runtime-dom/render.ts`

## 第 3 批

- `compiler-shared/ir.ts`
- `compiler-babel/component-analyzer.ts`
- `compiler-babel/jsx-to-ir.ts`
- `compiler-babel/ir-to-js.ts`

## 第 4 批

- `runtime-dom/condition.ts`
- `runtime-dom/list.ts`

## 第 5 批

- `runtime-wc/define-element.ts`
- `runtime-wc/slot.ts`
- `runtime-wc/light-dom-projection.ts`

---

如果你愿意，我下一条直接给你一版 **“Zeus MVP 任务清单（按 issue / milestone 形式）”**，你可以直接丢到 GitHub Projects 里用。
