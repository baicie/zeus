# AGENT.md（中文版）

本文件用于定义 **Zeus** 的产品方向、架构约束与实现规则。

Zeus 是一个现代前端框架，核心建立在 **细粒度响应式 + 编译时 DOM 生成** 之上，开发体验参考 SolidJS 与 React，并以强 Web Components 支持作为长期目标。

---

## 1. 项目定义

### 1.1 Zeus 是什么

Zeus 是：

- 一个 **编译器优先（compiler-first）** 的 UI 框架
- 一个基于 **细粒度响应式** 的框架
- 一个面向 **无 Virtual DOM 的精确 DOM 更新** 优化的框架
- 一个初期基于 **Babel/Vite 编译链** 构建的框架
- 一个后续计划演进到 **Rust 编译器后端** 的框架
- 一个从设计上就支持 **将组件编译为 Web Components**，并支持 **light DOM 投影 / slot 语义** 的框架

### 1.2 Zeus 不是什么

Zeus 不是：

- 一个 Virtual DOM 框架
- 一个运行时解释 JSX 的框架
- 一个在状态变化时重渲染整棵组件树的框架
- 一个从第一天开始就依赖隐藏式编译器魔法来承载全部响应式语义的框架

---

## 2. 核心产品原则

所有贡献者与 agent 都必须遵守以下原则。

### 2.1 组件不会重新渲染

一个 Zeus 组件应当只执行一次初始化流程，用于：

- 创建 signals / memos / effects
- 克隆静态模板
- 建立绑定
- 返回 DOM 节点

初始化完成后，状态变化只能更新真正受影响的绑定点。

**绝不能把组件 rerender 设计成 Zeus 的主要更新模型。**

### 2.2 编译器是主角

Zeus 必须将 JSX / TSX 编译为：

- 静态模板创建
- 直接 DOM 操作
- 精确绑定建立
- 带作用域的清理逻辑

不要把 Zeus 实现为通用的运行时 `createElement -> vnode -> diff -> patch` 系统。

### 2.3 运行时响应式是语义基础

Zeus 未来可以提供编译期语法糖，但真正的响应式语义必须建立在稳定的运行时模型上：

- `createSignal`
- `createMemo`
- `createEffect`
- `createRoot`
- `onCleanup`
- `batch`

即使未来语法糖发生变化，这套运行时模型也必须成立。

### 2.4 alien-signal 是内部引擎，不是公共契约

Zeus 可以在内部使用 `alien-signal`，但 **不能直接把 alien-signal 暴露成框架对外的公共契约**。

原因：

- 保留内部实现演进空间
- 避免编译器 / runtime 架构与第三方公开 API 强耦合
- 支持 DOM runtime 与 Web Components 所需的 owner / scope / disposal 规则
- 允许未来优化或替换实现而不破坏用户侧 API

### 2.5 Web Components 是一等编译目标

Web Components 支持不是附加能力，而是 Zeus 的核心目标之一。

Zeus 必须能够支持将组件编译为 custom elements，并具备：

- `defineElement(...)`
- 作为编译期内置宿主边界的 `<Host>`
- `<Slot>` 支持
- Shadow DOM 模式
- Light DOM 投影模式
- attribute / property 反射
- 与响应式作用域释放打通的生命周期清理

---

## 3. 响应式策略

### 3.1 MVP 必须具备的运行时 API

MVP 阶段的响应式 API 应显式且稳定：

```ts
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)
createEffect(() => {
  console.log(count())
})
```

这是必须成立的基线。

### 3.2 必须做编译时优化，但不需要一开始就做“全量编译期响应式魔法”

Zeus **必须** 对以下内容做编译时优化：

- 静态模板提取
- 绑定点布置
- 事件绑定建立
- 控制流降级
- DOM 更新最小化

但 Zeus **不需要** 从第一天起就实现类似 Svelte 那样、对响应式语义做大规模语法重写。

### 3.3 语法层的推荐长期方向

Zeus 应按以下顺序演进：

#### 阶段 1：显式运行时响应式

只使用显式 signal API。

#### 阶段 2：显式、可选的编译期语法糖

未来可考虑类似语法：

```ts
let count = $signal(0)
const doubled = $derived(count * 2)
$effect(() => {
  console.log(doubled)
})
```

这些语法糖必须满足：

- 显式
- 可选启用
- 作用范围受控
- 最终仍编译回同一套运行时语义

#### 阶段 3：之后再评估是否需要更深层语法变换

不要在项目初期就全局重定义普通 JavaScript 变量与赋值语义。

### 3.4 初期不要做什么

初期不要实现：

- 对普通 `let` 的隐式自动响应式
- 对任意 JS 语义的深度编译期改写
- 激进的 props 解构响应式转换
- 会显著增加调试难度的隐藏魔法

---

## 4. 渲染与 DOM 模型

### 4.1 不使用 Virtual DOM

Zeus 应直接更新 DOM。

编译器应将视图拆分为：

- 静态结构
- 动态表达式
- 事件处理器
- 列表 / 条件区域

### 4.2 静态模板提取

给定如下 JSX：

```tsx
<button class="btn">count: {count()}</button>
```

Zeus 应将其编译为概念上等价于：

- 被缓存的静态模板
- 克隆出来的 DOM 实例
- 被绑定的动态文本节点

### 4.3 绑定必须足够精确

动态表达式应映射到尽可能小的更新目标，例如：

- 单个文本节点
- 一个 attribute
- 一个 DOM property
- 一个 style 字段
- 一组 class token

### 4.4 组件返回的是 DOM，而不是 VNode

编译后的组件应返回 DOM 节点或片段，而不是中间虚拟树对象。

---

## 5. 编译器架构

### 5.1 编译阶段

编译链建议组织为：

1. 解析 TSX / JSX
2. 识别组件
3. 将 JSX 降级为 Zeus IR
4. 优化 IR
5. 生成 JS runtime 调用

### 5.2 Zeus IR 是必须的

不要把 Babel AST 当作框架长期内部协议。

Zeus 必须定义自己的 IR 层，用于表达：

- 模板
- 绑定
- 控制流
- 组件边界
- Web Components 元数据

这对以下目标非常关键：

- 未来迁移到 Rust 编译器
- 更好的诊断能力
- 更容易实现优化 pass
- 后续 SSR / codegen 的演进

### 5.3 推荐的 IR 结构

至少应支持：

- `TemplateIR`
- `TextBindingIR`
- `AttrBindingIR`
- `PropBindingIR`
- `EventBindingIR`
- `RefBindingIR`
- `ShowBindingIR`
- `ForBindingIR`
- `ComponentBindingIR`
- `HostBindingIR`
- `SlotBindingIR`

### 5.4 编译期内置节点

以下名字属于编译期内置节点，而不是普通运行时组件：

- `Show`
- `For`
- `Host`
- `Slot`

编译器必须显式识别它们。

---

## 6. 运行时架构

### 6.1 包拆分建议

项目应围绕以下职责划分 package：

- `zeus`：对外公共入口导出
- `core`：响应式运行时抽象
- `runtime-dom`：DOM helpers
- `runtime-wc`：Web Components runtime bridge
- `compiler-shared`：IR 与编译器公共模型
- `compiler-babel`：第一版编译器实现
- `vite-plugin`：集成层
- `types`：JSX 与公共类型支持

### 6.2 Core runtime 职责

核心运行时必须处理：

- 依赖追踪
- effect 执行
- owner / scope 管理
- cleanup 注册
- disposal
- batching

### 6.3 DOM runtime 职责

DOM runtime 应尽量保持轻量且聚焦：

- 模板创建与克隆
- 节点查找
- 文本绑定
- attribute / property 绑定
- class / style patch
- 事件绑定
- 条件 / 列表区域管理
- disposal hooks

不要把本该属于编译器的高层框架语义堆进 runtime-dom。

### 6.4 scope 与 cleanup 是必须项

Zeus 必须实现 owner / scope 模型。

它是以下能力成立的前提：

- 条件分支的挂载 / 卸载子树
- 列表项各自持有的资源 / effects
- Web Components 断开连接时的清理
- 避免内存泄漏

---

## 7. 控制流模型

### 7.1 Show

MVP 阶段，条件渲染应通过内置 `Show` 形式来编译：

```tsx
<Show when={visible()}>
  <span>Visible</span>
</Show>
```

它应被编译为区域锚点与子树挂载 / 卸载逻辑。

### 7.2 For

MVP 阶段，列表渲染应通过内置 `For` 形式来编译：

```tsx
<For each={items()}>{item => <li>{item.name}</li>}</For>
```

第一版可以优先保证正确性，而不是极限性能；但长期目标应是具备 key 的 reconciliation、节点复用与子树清理。

### 7.3 Fragments

必须支持 Fragment，但应编译为基于区域 / 锚点的 DOM 处理，而不是虚拟结构。

---

## 8. Web Components 模型

这是 Zeus 的定义性特性之一。

### 8.1 编写模型

目标 API 形态如下：

```tsx
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

### 8.2 Host 仅存在于编译期

`<Host>` 不是普通组件。

它表示：

- custom element 的宿主边界
- 挂载目标选择
- Shadow DOM 或 Light DOM 模式选择
- 如 `delegatesFocus` 等宿主元信息

规则：

- `Host` 只能出现在 `defineElement` 渲染树的根宿主边界
- `Host` 不能被当作普通 DOM 标签处理

### 8.3 Slot 语义

`<Slot>` 也是编译期内置节点。

#### Shadow DOM 模式

在 Shadow DOM 模式下：

- 编译为原生 `<slot>`
- 使用浏览器原生 slot 投影能力

#### Light DOM 模式

在 Light DOM 模式下：

- **不能** 依赖原生 `<slot>`
- 应实现 Zeus 自己管理的投影语义
- 投影逻辑应收集 host 的子节点并插入对应 slot 锚点
- 必须支持具名 slot 与默认 slot
- 投影更新应可通过 `MutationObserver` 等运行时机制感知

重要：**Light DOM slot 投影是 Zeus 自己的语义，不是浏览器原生 slot 行为。**

### 8.4 Attribute / property 反射

`defineElement` 应允许声明带类型的 prop schema。

对原始类型：

- `String`
- `Number`
- `Boolean`

Zeus 应支持 attribute 监听与类型转换。

对对象 / 数组：

- 只支持 property 行为是可接受的
- MVP 不强制做 attribute 序列化

### 8.5 生命周期集成

生成出的 custom element 必须将响应式作用域清理与以下生命周期打通：

- `connectedCallback`
- `disconnectedCallback`
- `attributeChangedCallback`

当元素断开连接时，必须释放对应的响应式 root。

---

## 9. 公共 API 指导原则

### 9.1 稳定的 MVP 对外接口

早期 Zeus 的公共 API 应保持小而明确。

推荐导出：

- `createSignal`
- `createMemo`
- `createEffect`
- `createRoot`
- `onCleanup`
- `batch`
- `render`
- `Show`
- `For`
- `defineElement`
- `Host`
- `Slot`

### 9.2 避免过早扩大 API 面积

在核心模型稳定之前，不应优先做：

- router
- 超出基础 signals 的 store 系统
- async resource 原语
- 类 suspense 编排
- SSR
- CSS-in-JS 系统
- 大规模内置组件生态

---

## 10. MVP 路线图

### MVP-0：架构 RFC

在大规模实现之前，先写 RFC：

- 组件执行与更新模型
- JSX / IR 编译语义
- Web Components 语义

### MVP-1：响应式核心 + 基础 DOM runtime

必须交付：

- signals
- effects
- root / cleanup
- template clone
- 文本绑定
- attribute 绑定
- 事件绑定
- `render`

### MVP-2：Babel 编译器基线

必须交付：

- 组件识别
- TSX / JSX 到 IR 的降级
- 基础 DOM codegen
- 精确的 text / attr / event 更新

### MVP-3：控制流

必须交付：

- `Show`
- Fragment 处理
- `For`
- 区域锚点
- 子树 cleanup

### MVP-4：Vite 集成 + 开发期诊断

必须交付：

- dev 模式下 `.tsx` 编译
- source maps
- 有用的诊断信息
- 初步 HMR 支持

### MVP-5：Shadow DOM 模式下的 Web Components

必须交付：

- `defineElement`
- `Host`
- `Slot`
- Shadow DOM 挂载
- prop 反射
- 生命周期清理

### MVP-6：Light DOM 投影

必须交付：

- 投影 runtime
- 具名 / 默认 slot 放置
- 投影更新
- 明确语义文档

### MVP-7：优化与编译器演进

只有在语义稳定之后再做：

- 更紧凑的 codegen
- 更强的列表 reconciliation
- 事件代理
- Rust 编译器工作

---

## 11. 诊断与 DX 规则

Zeus 应优先给出清晰的编译期诊断，而不是依赖沉默的魔法行为。

### 11.1 对不支持模式进行 warning 或 error

例如：

- 在不支持场景下的响应式 props 解构
- 在 `defineElement` 外使用 `Host`
- 在 host 子树外使用 `Slot`
- 非法的控制流内置节点用法
- `For` 中不稳定的列表标识

### 11.2 显式优先于聪明

当需要在以下两者中做选择时：

- 稍长但语义明显的 API
- 更短但语义容易变复杂的 API

在 Zeus 初期，应优先选择更显式的方案。

---

## 12. 初始版本的非目标

以下内容在第一个严肃里程碑中都不是必须项：

- SSR
- hydration
- partial hydration / islands
- server components
- 高级 scheduler / concurrency 模型
- 隐藏式、全语言级别的编译期响应式语义
- 完整样式系统发明

这些可以未来探索，但不能阻塞初始架构落地。

---

## 13. 给未来贡献者与 agent 的决策规则

在做实现决策时，按以下顺序判断：

1. 优先保持细粒度更新，而不是 rerender 式设计。
2. 优先选择编译器降级后的 DOM 操作，而不是额外运行时抽象层。
3. 保持运行时语义稳定且显式。
4. 保持公共 API 不依赖 `alien-signal` 细节。
5. 将 Web Components 视为核心目标，而不是可选适配层。
6. 只有当前一层语义稳定后，才继续叠加下一层能力。
7. 在高级语法糖之前，优先保证正确性与可调试性。
8. 在项目尚未验证更简单路径之前，不要引入需要重定义普通 JS 语义的语法魔法。

---

## 14. 推荐的近期下一步

当前最重要的具体交付物是：

1. `RFC-001`：组件执行与更新模型
2. `RFC-002`：JSX 到 IR 结构
3. `RFC-003`：Web Components 语义
4. `packages/core`：signal + owner + cleanup 基线
5. `packages/runtime-dom`：template + text + attr + event helpers
6. `packages/compiler-shared`：IR 定义
7. `packages/compiler-babel`：最小 JSX -> IR pass

---

## 15. 项目立场简述

如果出现歧义，请记住：

**Zeus 是一个编译器优先、细粒度、直接操作 DOM 的框架，采用显式运行时响应式，并在未来提供友好的编译期语法糖；它不是 Virtual DOM 框架，也不是从第一天起就依赖 JavaScript 语义魔法实验的框架。**
