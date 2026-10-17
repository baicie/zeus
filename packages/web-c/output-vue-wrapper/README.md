# Vue Web Component 包装器

三个生成模式均从每个组件的 `zeus:wc:<tag>` 入口显式导入 `defineCustomElement`，在 Vue `onBeforeMount` 生命周期中注册。创建 wrapper、Node 导入和服务端渲染不执行注册；同一 wrapper 在同一 registry 中多次挂载只注册一次。

`runtime` 模式把声明的复杂值写入已注册元素的 DOM property，监听真实 CustomEvent，卸载时清除普通事件和 model 事件监听器；普通事件回调收到原始事件对象。model 的 `eventPath` 明确指定取值路径，省略时读取 `event.detail`；例如 `eventPath: 'detail.value'`。

具名 slot 通过标准 `slot` 属性投影；children 由 Vue 管理。服务端安全保证适用于 runtime 入口和 lazy WC 产物，eager WC 实现源码和显式 `register: 'side-effect'` 配置保留其浏览器依赖及注册行为。
