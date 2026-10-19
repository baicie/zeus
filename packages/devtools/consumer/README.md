# @zeus-js/devtools-consumer

Zeus DevTools 的内部 consumer/panel 状态模型。它消费
`window.__ZEUS_DEVTOOLS_HOOK__` 的 runtime 事件，在同一个浏览器 realm 内维护
Owner、Effect、DOM Binding 和响应式依赖边，并可通过 click 事件选择 DOM 节点。

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
