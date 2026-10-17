# React Web Component 包装器

默认 `runtime` 模式支持 React 18 和 React 19。生成器通过每个组件的 `zeus:wc:<tag>` 入口导入 `defineCustomElement`，并传入声明的 property 名单。导入或服务端渲染 wrapper 不注册元素；真实 DOM ref 提交时才注册，随后同步 properties、CustomEvent 和用户 ref。同一 wrapper 在同一 registry 中重复挂载或经过 StrictMode 检查时只注册一次，卸载时移除事件监听器。

手动调用 `createComponent` 时，可用 `props: ['value', 'config']` 指定需要直接写入 DOM property 的字段，避免复杂值变成 HTML attribute。`ref` 指向真实 custom element，具名 slot 由带 `slot` 属性的容器承载，children 由 React 管理。

`minimal` 模式要求 React 19，首次 ref 提交时补齐注册前的 property 值，后续更新使用 React 自身的 custom element 支持。生成器会把 Manifest 的 `onValueChange` 映射成 React 19 识别的 lowercase DOM event prop `onvalue-change`，因此回调收到原始 `CustomEvent` 和 `event.detail`。`event-bridge` 模式显式同步属性和监听真实 DOM 事件。

服务端安全保证适用于 runtime 入口和 lazy WC 产物。选择 eager WC 实现入口时，其组件源码仍可能在模块加载时定义依赖浏览器的类；选择 `register: 'side-effect'` 时导入即注册是该配置明确要求的行为。

回归测试通过独立 Node 子进程导入和 React 服务端渲染验证无 DOM 场景，并在真实 JSDOM custom element registry 中验证三个生成模式。
