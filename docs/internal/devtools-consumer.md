# DevTools Consumer / Panel MVP

`packages/devtools/consumer` 是 runtime DevTools 事件协议的同 realm consumer。
它不参与 Zeus 更新流程，只把 `window.__ZEUS_DEVTOOLS_HOOK__.emit(event)` 事件折叠成
面板可以直接读取的快照：

- `owners` 保存 `owner:create` / `owner:dispose` 与 parent-child 关系；
- `effects` 保存运行次数、触发次数和累计/最近耗时；
- `bindings` 保存 DOM target、binding kind、cleanup 状态和依赖边；
- `sources` 保存 `sourceId → bindingId` 关系以及依赖 key；
- `selected` 保存最近一次 DOM 选择关联的 Binding、Effect 和 source signal。

## 连接 runtime

```ts
import {
  createDevtoolsConsumer,
  createDevtoolsPanel,
} from '@zeus-js/devtools-consumer'

const consumer = createDevtoolsConsumer(window, {
  onSelect(selection) {
    // 使用 selection.bindingIds / selection.sourceIds 更新面板详情。
    console.log(selection)
  },
})

consumer.connect()
const panel = createDevtoolsPanel(
  document.querySelector('#zeus-devtools')!,
  consumer,
)
```

`createDevtoolsPanel()` 返回可直接挂载的 DOM 面板，包含 Components、Owner tree、
DOM bindings、Effects、Signals 和 Selected DOM 六个可折叠区域。点击应用 DOM 后，
Selected DOM 会显示命中的 Binding、Effect 与 Signal ID；Binding cleanup 和 Effect
耗时也会随 snapshot 更新。`panel.disconnect()` 只移除面板订阅和面板节点，不会断开
consumer 或应用 runtime。

编译器生成的动态文本/节点区域通过 `mountDynamic()` 建立 reactive
`dynamic-region` binding；该 binding 与直接 text/attr/property binding 一样发出
Effect、依赖 track/trigger、commit 和 cleanup 事件。`pnpm check:devtools-panel`
会先构建生产示例，再在开发服务器的真实 instrumented runtime 中运行
Chromium/Firefox/WebKit，点击 DOM 并确认面板显示 Binding、Effect 和 Signal。

`connect()` 会链上已有 runtime hook，避免覆盖同 realm 的其它观察者；多个 consumer 可以
同时连接，断开其中一个不会恢复或移除其它 consumer。调用 `disconnect()` 会移除 click
listener，并在最后一个 consumer 断开时恢复之前的 hook。consumer 的 listener 和
`onSelect` 回调异常会被隔离，不能中断 runtime 的响应式更新。

`getSnapshot()` 始终同步返回当前状态。`subscribe()` 首次同步交付快照，后续事件在一个
microtask 内合并为一次交付，避免每个 binding/依赖事件都复制并排序整个图；没有订阅者时
不创建通知快照。订阅首次交付中的异常同样被隔离。连接 hook 或安装 click listener 失败
会回滚本次连接，调用方可在原因消除后再次 `connect()`。

清理后的诊断历史默认在 owners/effects/bindings/sources 各保留最近 500 条。可用
`historyLimit` 设置每类非活动条目的上限，`0` 表示不保留；活动条目不受此上限影响。
已释放 owner、已清理 binding、最后一个 binding 被清理后的 effect，以及没有依赖 binding
的 source 才会进入历史。超限时移除最早的历史项，避免反复挂载/卸载导致图无限增长。
根 owner 释放时，它的后代 owner 同时进入历史，符合 owner 子树的生命周期。
binding 耗时只使用自身 `binding:commit.payload.duration`，不从其它 effect 事件推断。

## DOM 点击追踪边界

MVP 在同一个浏览器 realm 内用事件里的 `target: Node` 和 `composedPath()` 做反查。点击
元素时会聚合路径上的属性/property/class/style binding，以及直接 Text 子节点上的 text
binding，然后通过当前依赖边得到对应 `sourceId`。事件没有 target 或 target 已被 cleanup
时不会产生有效选择；cleanup 后只保留诊断摘要，不继续持有 DOM 节点。

节点不跨窗口序列化，consumer 也不会注入生产环境 runtime。独立 DevTools iframe/
跨窗口 `MessagePort` emitter/consumer 已提供版本化、可序列化的事件通道；组件 create/dispose
元数据也会进入 panel 快照。浏览器扩展所需的更高层 postMessage 握手和 source signal 值展示
仍留给后续切片。
