# RFC-011：Framework Renderer Adapter 与跨框架交互插槽边界

- 状态：Proposal
- 日期：2026-10-17
- 对应设计任务：F-009
- 依赖：RFC-003、RFC-004、RFC-010
- 相关任务：E-004、U-003、U-004、U-006

## 摘要

Zeus Web Component（WC）是 React/Vue 消费者之间的 ABI 边界。普通默认
Slot 和具名 Slot 通过现有 wrapper 映射为 DOM 子节点，并由 Shadow DOM 原生
Slot 或 Zeus Light DOM Projection 处理。React `ReactNode`、Vue VNode、Portal
和 Teleport 不是 WC Runtime 可以解释的值，不能直接穿过 WC ABI。

需要承载复杂框架节点时，由对应框架的 Renderer Adapter 在明确的容器内创建、
更新和释放框架节点。WC Runtime 只提供宿主容器、生命周期和原生 ABI，不解析
VNode，不执行框架 Hook/Context，也不负责框架的 reconcile。该边界允许 DataGrid
等组件同时提供 native renderer 和可选的 React/Vue cell renderer，而不把
Zeus DOM Runtime 变成多框架 VDOM Runtime。

本 RFC 冻结边界和最小接口。框架无关的 keyed renderer host PoC 已验证生命周期、
renderer swap、容器复用和回收；React/Vue wrapper 的 SSR 与浏览器 consumer 回归
继续验证普通 Slot 的实际边界。具体 React/Vue cell adapter 和公开 DataGrid API
仍由 U-003/U-006 另行实现，不改变本 RFC 的 WC ABI 契约。

## 1. 背景与问题

当前 React/Vue wrapper 已支持普通 Slot：

- React 默认 `children` 由 React 生成并交给 custom element；具名 slot prop
  被转换为带 `slot="name"` 的子节点。
- Vue 默认 slot 和具名 slot 由 Vue 生成 VNode；具名 VNode 由 wrapper 加上
  `slot` 属性后交给 custom element。
- WC Runtime 只观察和投影 DOM 节点，不知道这些节点来自 React 还是 Vue。

这套模型适合文本、按钮和普通可投影内容，但不适合下列场景：

```tsx
<DataGrid
  columns={[
    {
      id: 'price',
      render: row => <PriceCell row={row} />,
    },
  ]}
/>
```

`render` 返回的 React Element 需要 React 的 Hook、Context 和更新调度；Vue
同类 renderer 返回 VNode，需要 Vue 的 renderer 和组件实例。Zeus WC Runtime
不能安全地调用、序列化或比较这些值。把它们放进 WC property 会丢失框架所有权，
把它们当作 Slot 则无法定义虚拟化、回收、卸载和 Portal 的生命周期。

## 2. 目标

本 RFC 的目标是：

1. 固定普通 default/named Slot 与复杂 framework renderer 的边界。
2. 为 React 18/19 和 Vue 3 提供一个框架无关的 mount/update/dispose 生命周期协议。
3. 允许 DataGrid 在 virtualizer 计算出的可见区域内挂载框架 cell，并保持稳定的
   DOM identity、焦点、Selection 和清理顺序。
4. 让 Portal/Teleport 由框架 adapter 自己管理目标节点和清理，不把通用 Portal
   语义加入 WC Runtime。
5. 保持 `runtime-dom`、`web-c-runtime` 和核心 WC ABI 不依赖 React/Vue。

## 3. 非目标

以下能力不由本 RFC 定义：

- 把 React/Vue VNode 放入 WC property，或让 WC Runtime 解释 VNode。
- 在 Zeus 中引入 Virtual DOM、组件级重新执行或多框架 reconcile。
- 为所有场景提供通用 Portal 服务、ErrorBoundary 或 Transition 调度。
- 自动把 Slot 虚拟化，或保证传入大量 Slot 子节点时只挂载可见节点。
- 在 React/Vue 之间共享 Hook、Context、组件实例或调度器。
- 异步 renderer、streaming renderer、跨文档 renderer 和 renderer worker 协议。
- SSR 中执行 React/Vue renderer 内容或提供 hydration。

通用 Portal、ErrorBoundary 和 Transition 的公共语义属于 E-004；本 RFC 只规定
它们在 WC 宿主边界两侧的所有权和清理要求。

## 4. 术语与分层

| 术语                       | 定义                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| WC Runtime                 | `runtime-dom`、`web-c-runtime` 和 custom element host 的运行时。负责 DOM、属性、事件、Slot、生命周期和 cleanup。 |
| Framework Wrapper          | 由 Manifest 生成的 React/Vue 组件。负责把 props、events、普通 children 和 named slots 映射到 WC ABI。            |
| Framework Renderer Adapter | 由 React/Vue 消费者提供的适配器。负责在指定容器内创建、更新和释放框架节点。                                      |
| Renderer Container         | 由宿主为一个 renderer handle 保留的 DOM 元素。container 的所有子节点由 adapter 所属框架管理。                    |
| Renderer Handle            | adapter 返回的生命周期句柄。用于将同一个逻辑 renderer 更新或释放。                                               |
| 普通 Slot                  | 由 DOM 节点表示的 default/named 投影内容，可由 wrapper 或原生消费者提交。                                        |
| 复杂框架节点               | 需要 React/Vue renderer 才能执行的 ReactNode、VNode、Portal 或 Teleport。                                        |

依赖关系必须保持为：

```text
Grid Model / Viewport
          |
          v
Renderer host container  <-->  Framework Renderer Adapter
          |
          v
WC Runtime / Custom Element ABI
```

WC Runtime 不反向调用 React/Vue renderer，也不保存 VNode 或框架组件实例。

## 5. 普通 Slot 契约

### 5.1 Default 与 named Slot

普通 Slot 是默认的跨框架内容通道：

- default Slot 使用 wrapper 的 `children` 或 Vue `slots.default`；
- named Slot 使用 Manifest 声明的名称。React 使用同名 prop，Vue 使用同名
  template slot；wrapper 最终提交带 `slot="name"` 的 DOM 子节点；
- 缺少投影内容时，WC 依据自身的 fallback 规则处理，不由 wrapper 伪造字符串
  或框架组件；
- Slot 名称必须来自 Component Manifest。未知 named slot 不得静默变成属性或
  组件 children。

### 5.2 所有权

- React/Vue reconcile 产生的子节点由对应框架拥有。WC Runtime 不主动删除、移动、
  克隆或重建这些节点；
- Shadow DOM 模式使用原生 `<slot>`，由浏览器完成投影；
- Light DOM 模式由 Zeus Projection 管理投影占位符、MutationObserver 和节点
  恢复。Observer 只能观察被声明为投影来源的直接子节点，不能捕获 adapter
  在 renderer container 中生成的内部节点；
- wrapper 不把 slot function、React Context、Vue slots object 或 VNode 作为
  custom element property；事件 `detail` 也不得携带要求另一框架解释的节点。

### 5.3 Slot 与复杂 renderer 的区别

普通 Slot 适合可被 DOM 表达的内容。下列值必须进入 Framework Renderer Adapter，
不得伪装成 Slot：

- 返回 React Element 或 Vue VNode 的 cell renderer；
- React Portal 和 Vue Teleport；
- 需要 Hook、Context、组件实例或框架 scheduler 的内容；
- 需要按 row/column key 复用和回收的虚拟化内容。

## 6. Renderer Adapter 接口

这是框架无关的最小契约提案。它不是 WC Manifest 字段，也不是 `runtime-dom`
公共入口。当前仓库的 PoC 使用泛化的 `Container` 和 opaque `Handle`，放在
`@zeus-js/shared` 的未导出内部模块中仅供契约测试；真正的 Zeus UI 或框架专用
adapter 可以把它收窄为 `Element` 与带 `container/state` 的 `RendererHandle`。

```ts
interface RendererAdapter<Container, Data, Context, Handle> {
  mount(container: Container, data: Data, context: Context): Handle
  update(handle: Handle, data: Data, context: Context): void
  dispose(handle: Handle): void
}

interface RendererHandle {
  readonly container: Element
  readonly state: 'mounted' | 'disposed'
}
```

### 6.1 mount

`mount` 接收一个空的、由宿主拥有的 container，并在其内部创建框架节点。
adapter 必须：

- 返回与该 container 一一对应的 handle；
- 记录足够的框架 root/实例信息，以便后续 `update` 和 `dispose`；
- 只修改 container 及其由本次 mount 创建的框架节点；
- 在同步接口返回前完成 root 创建。异步加载和取消协议不属于 MVP；
- 发生异常时释放已经创建的框架资源，再把原始异常传给宿主。

### 6.2 update

`update` 只能更新同一个 adapter、同一个 container 和仍为 `mounted` 的 handle。
宿主以稳定的逻辑 key 决定何时调用 update；adapter 不负责猜测 key 或比较
DataGrid 的全量数据。

以下情况必须产生可诊断错误，而不是静默重新 mount：

- handle 已经 dispose；
- handle 不属于当前 adapter；
- handle 的 container 与宿主记录不一致；
- adapter 在更新期间抛出异常。

### 6.3 dispose

`dispose` 负责卸载框架 root、事件监听器、Effect、Context 和 Portal/Teleport
关联资源。宿主必须允许 `dispose` 被调用一次；重复调用应幂等。dispose 完成后，
handle 状态为 `disposed`，后续 update 不得重新激活旧 root。

当 custom element 断开连接时，宿主必须先停止向该 handle 调度更新，再调用 dispose。
重连产生新的 mount；除非具体 adapter 另有明确生命周期协议，不能复用已 disposed
handle 或依赖 detached DOM 保留框架状态。

### 6.4 Context 边界

Context 可以包含稳定的业务数据和宿主回调，例如：

```ts
interface GridRenderContext<Row> {
  rowKey: string | number
  columnId: string
  getRow(key: string | number): Row | undefined
  getColumn(id: string): unknown
  onCellAction(action: unknown): void
  signal?: AbortSignal
}
```

Context 不得要求 WC Runtime 理解 ReactNode、VNode、Hook、Context provider、
框架 ref 或框架 scheduler。`signal` 只用于 adapter 自己的取消和资源清理；
本 RFC 不定义异步 mount 的等待语义。

## 7. React Adapter

React 18 和 React 19 都应由同一逻辑契约驱动，差异留在 adapter 内部：

- React 18 使用 `createRoot(container)` 或等价的 React 18 root API；
- React 19 使用对应版本的 root API；
- ReactNode、Hook、Context 和 React Portal 只在 adapter 内解释；
- adapter 不把 framework renderer 的 root 交给 `runtime-dom` 或 WC Host；
- React wrapper 的普通 `children` 和 named slot 仍走第 5 节的 DOM Slot 契约，
  不自动转换为 renderer adapter；
- `ref` 指向 WC host 或 adapter 明确暴露的框架容器，不得混淆两者。

React Portal 的 target 由 React adapter 创建或接管。target 可以在 host 内部，
也可以由使用方提供；无论位置如何，target 的 owner、root 和清理都由 adapter
记录。WC host 断开时，adapter 必须卸载 Portal root，不能由 Light DOM observer
尝试接管 Portal 节点。

## 8. Vue Adapter

Vue 3 的 VNode、component instance、provide/inject 和 Teleport 只在 Vue adapter
内解释：

- adapter 可以使用 Vue `createApp`/`render` 或等价的 VNode render API；
- Vue wrapper 的普通 default/named slot 仍由 wrapper 生成带 `slot` 属性的 DOM
  节点；
- VNode 不得作为 WC property 或 `CustomEvent.detail` 传给 Zeus Runtime；
- Teleport target 的创建、更新、卸载和 owner cleanup 由 Vue adapter 负责；
- host disconnect 后不得继续提交旧 VNode。重连时重新 mount，并重新建立 Vue root。

Vue adapter 不得要求 `runtime-dom` 依赖 Vue，也不得让 WC host 直接调用 Vue
renderer。

## 9. DataGrid Custom Renderer PoC

F-009 的实现验收以 DataGrid custom renderer PoC 为入口。当前 DataGrid Manifest
和 `DataGridColumn` 尚未公开 `cellRenderer` 字段；PoC 不得把未验证的字段直接标记
为稳定 ABI，也不得把 React/Vue 节点塞进 `rows` 或 `columns` property。

### 9.1 分层

```text
DataGrid Headless Model
          |
Viewport Controller / Virtualizer
          |
Native Cell Renderer  <-->  Framework Renderer Adapter
          |
          v
WC Host / DOM
```

Grid Model 和 virtualizer 只产生行键、列 ID、可见 range 与 cell data，不依赖
React/Vue。adapter 接在可见 range 的 commit 边界，宿主负责 container 的创建、
复用、回收和 dispose。

### 9.2 Identity 与回收

每个框架 cell 的逻辑 key 至少由以下内容组成：

```text
(rowKey, columnId, renderer identity)
```

- key 和 renderer identity 都不变时，调用同一 handle 的 `update`；
- key 变化或 renderer identity 变化时，先 `dispose` 旧 handle，再 `mount` 新 handle；
- 离开可见 range 的 cell 必须 dispose，或进入有明确上限的 adapter 专属池；
- DOM pool 不得跨 renderer identity 复用框架 root；
- 同一 container/handle 的前提下，adapter 可以承诺焦点和 Selection 保留；
  container 被回收后不承诺原生焦点继续存在；
- host disconnect、virtualizer dispose 和 renderer swap 都必须经过同一 cleanup
  路径，不能依赖最终垃圾回收。

### 9.3 最小 PoC 范围

PoC 至少应验证：

- 一个 primitive/native cell 与一个 React/Vue custom cell 并存；
- 可见 range 初次 mount、同 key update、换 key dispose/mount；
- 滚动导致的离屏回收和重新进入；
- adapter 异常不会留下 listener、root 或孤立节点；
- active cell、焦点和 Selection 在稳定 identity 下保持；
- host disconnect/reconnect 不会重复派发事件或复用 disposed root。

## 10. Portal 与 Teleport 边界

Portal/Teleport 默认不允许直接跨 WC Runtime。使用方必须显式选择对应的
Framework Renderer Adapter，并满足：

1. adapter 记录 target、root 和 owner；
2. target 不可用时 mount/update 产生可诊断错误，并释放已分配资源；
3. host dispose 时先停止更新，再卸载 Portal/Teleport root；
4. target 在 host 外部时，WC Runtime 不移动、不观察、不回收 target 的节点；
5. target 由其他 owner 管理时，adapter 只能使用明确的外部 dispose 协议，不能
   擅自删除非自身节点。

这只冻结宿主边界，不定义跨应用 Portal 路由、焦点管理、Escape 关闭或 Transition
时序；这些语义由 E-004 或对应框架 adapter 另行定义。

## 11. SSR 与 hydration

本 RFC 遵守 RFC-004 和 F-007：

- SSR 只输出 custom element 宿主 tag 和安全可序列化的 primitive attributes；
- SSR 不执行 React/Vue renderer，不序列化 ReactNode、VNode、Portal 或 Teleport；
- renderer container 内部内容不被声明为 SSR 输出；
- 当前不提供 hydration。浏览器端由 wrapper/adapter 重新 mount 并升级 custom
  element，不能假定服务端 renderer DOM 可被 adapter 接管；
- 需要首屏框架内容的应用必须在框架自身 SSR 层完成，并自行承担 host/container
  一致性；这不改变 Zeus WC Runtime 的 no-hydration 契约。

## 12. 包边界与依赖

- `runtime-dom`、`web-c-runtime`、`compiler-shared` 和 WC ABI 不新增 React/Vue
  peer dependency；
- 现有 React/Vue wrapper 继续只负责普通 props/events/ref/Slot 映射；
- F-009 PoC 优先放在 Zeus UI 或框架专用 adapter 包中，不为尚未稳定的通用协议
  新建空壳公共包；
- 若后续协议稳定，需要公共包，应分别声明 React/Vue peer dependency，并从同一
  版本化的 adapter contract 生成类型；不得让 runtime-dom 反向依赖它们；
- Manifest 只描述可序列化的组件 ABI，不写入 adapter 实例、VNode、ReactNode、
  root、Portal target 或函数闭包。

## 13. 诊断与错误

Proposal 阶段建议使用以下稳定错误码，最终名称需随 PoC 测试冻结：

| 错误码                             | 触发条件                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| `ZEUS_RENDERER_DISPOSED`           | 对 disposed handle 调用 update，或尝试重新激活旧 handle。 |
| `ZEUS_RENDERER_CONTAINER_MISMATCH` | handle、adapter 与宿主记录的 container 不一致。           |
| `ZEUS_RENDERER_ADAPTER_FAILURE`    | mount/update/dispose 内部异常未能完成契约操作。           |
| `ZEUS_RENDERER_TARGET_UNAVAILABLE` | Portal/Teleport target 不存在或已被释放。                 |
| `ZEUS_RENDERER_UNSUPPORTED_VALUE`  | VNode、ReactNode 或框架函数被错误传入 WC ABI。            |

错误必须带组件 tag、renderer identity、rowKey/columnId（若可用）和生命周期阶段；
不得把 VNode 静默字符串化，也不得把错误降级成普通 Slot。

## 14. 验收矩阵

RFC 只有在以下证据齐全后才能从 Proposal 改为 Accepted：

| 层级     | 必测场景                                                                        | 通过要求                                                                       |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Contract | common adapter 类型、mount/update/dispose、重复 dispose、disposed update        | 类型和测试不导入 React/Vue；错误码稳定。                                       |
| Slot     | default、named、fallback、动态增加/删除/改名、Shadow/Light projection           | React 18/19、Vue 3 的普通 Slot 行为与现有 WC 契约一致。                        |
| React    | React 18/19 custom cell、root cleanup、Portal target、host disconnect/reconnect | 无孤立 root/listener；不改变 WC host 注册和事件语义。                          |
| Vue      | Vue 3 VNode、Teleport target、root cleanup、host disconnect/reconnect           | 无孤立 VNode/instance；重连不复用 disposed root。                              |
| DataGrid | stable key update、renderer swap、range recycling、focus/Selection              | DOM identity 和 cleanup 顺序可观察，virtualizer 不依赖框架。                   |
| SSR      | Node import、host tag、primitive attributes、复杂 renderer/Portal               | 零 DOM 注册；不输出 VNode、函数源码或 `[object Object]`；无 hydration 承诺。   |
| Browser  | Chromium、Firefox、WebKit 的 React18/19、Vue3 消费者                            | 后续完整矩阵验收；本阶段仅报告现有 wrapper 的 Node SSR/browser consumer 回归。 |

## 15. 迁移与开放问题

普通 Slot 消费者无需迁移，继续使用生成的 React/Vue wrapper。需要 custom cell
renderer 的消费者必须显式选择对应 adapter；不能依赖把 renderer 函数放进 WC
property 的历史行为。Beta 阶段不保留旧/new 双协议或转发 alias。

以下问题留给后续 RFC 或实现评审：

- adapter 是否需要 `prepare`/`reset` 以支持有上限的 DOM pool；
- 异步 renderer 的 Abort、竞态和错误边界；
- 跨 document/iframe target 的 owner 与事件策略；
- React/Vue DevTools 与 Grid commit diagnostics 的关联方式；
- E-004 对 Portal、Transition 和错误恢复的公共语义。

## 16. 当前实现状态

截至本 RFC 日期：

- React/Vue 普通 default/named Slot wrapper 已实现并有生成器与消费者回归；
- WC Runtime 已实现 Shadow native Slot 和 Light DOM Projection 的独立语义；
- DataGrid 尚未公开 `cellRenderer`/Framework Renderer Adapter API；
- 框架无关的 keyed renderer host PoC 已实现并覆盖 mount/update/dispose、renderer
  swap、容器变化、回收和重复 dispose；React/Vue wrapper 的 Node SSR 与 browser
  consumer 回归已通过；
- React/Vue 专用 cell adapter、Portal/Teleport 和 focus/Selection 完整矩阵与公开
  DataGrid `cellRenderer` API 不在本次改动中，
  由 U-003/U-006 继续实现，不能把它们写入 WC ABI。
