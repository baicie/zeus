# @zeus-js/devtools-consumer

Zeus DevTools 的内部 consumer/panel 状态模型。它消费
`window.__ZEUS_DEVTOOLS_HOOK__` 的 runtime 事件，在同一个浏览器 realm 内维护
组件、Owner、Effect、DOM Binding 和响应式依赖边，并可通过 click 事件选择 DOM 节点。

该包目前是 workspace 内部实现，协议仍以 `@zeus-js/runtime-dom` 的开发期事件为准。
它不把 DOM 节点序列化到跨窗口通道，也不在生产构建中启用 runtime instrumentation。

```ts
import { createDevtoolsConsumer } from '@zeus-js/devtools-consumer'

const consumer = createDevtoolsConsumer(window, {
  onSelect(selection) {
    console.log(selection.bindingIds, selection.sourceIds)
  },
})

consumer.connect()
consumer.subscribe(snapshot => renderPanel(snapshot))
```

调用 `disconnect()` 会移除 click listener，并恢复安装 consumer 之前的 runtime hook。
`getSnapshot()` 同步读取当前状态；`subscribe()` 首次同步交付，后续事件按 microtask 合并。
每类非活动诊断历史默认保留 500 条，可用 `historyLimit` 调整；活动条目不会被裁剪。

跨窗口面板使用 `MessageChannel` 时，在应用窗口安装 emitter，在面板窗口安装
consumer：

```ts
const emitter = createDevtoolsPortEmitter(window, channel.port1)
const panel = createDevtoolsPortConsumer(channel.port2)
panel.connect()
emitter.connect()
```

通道消息固定为 `channel: 'zeus-devtools'`、`version: 1` 的事件包。事件中的 DOM
引用会被移除，只保留 `targetId` 和可结构化克隆的 payload；错误版本或非法消息会被
忽略。断开 emitter 会恢复原有 runtime hook，断开 panel 会移除 message listener。
