# RFC-003：Web Components 语义

## 状态

Accepted

## 目标

`defineElement` 定义唯一的 Web Component 行为协议。eager custom element 与 lazy loader 是同一协议的两个 adapter，只允许加载时机不同，不允许 props、reflection、form callbacks、slot 或 disposal 语义分叉。

## 统一挂载契约

共享定义 module 负责：

- prop schema 归一化、默认值工厂与 property upgrade；
- attribute/property 转换与 reflection loop 抑制；
- setup context、events、methods 和 ElementInternals；
- render target、styles、owner/scope 与断开清理；
- Light DOM 投影节点的捕获、变更与恢复。

eager adapter 负责 `customElements.define` 和同步连接；lazy adapter 负责 module 加载、ready promise 与延迟 method proxy。生成代码只传递序列化 metadata 和 loader，不复制挂载算法。

## 生命周期

- `connectedCallback` 幂等挂载；重连时建立新响应式 root，但复用合法的 shadow root。
- `disconnectedCallback` 立即释放响应式 root 和投影 observer。
- lazy 加载期间断开时不得挂载；再次连接可继续或重新使用已缓存 module。
- `attributeChangedCallback` 与 property write 使用同一 prop store；reflection 不得递归。
- form callbacks 在实例就绪前按浏览器触发顺序排队，就绪后只分发一次。

## Slot

Shadow DOM 使用原生 `<slot>`。

Light DOM 使用 Zeus 投影：

- 支持默认与具名 slot；
- host child 增加、删除或 `slot` 属性变化时重新投影；
- 使用 `MutationObserver` 观察 host 的直接子节点与 `slot` attribute；
- 框架生成节点与用户投影节点必须可区分，observer 不得形成反馈循环；
- 断开时停止 observer，并保留重连所需的投影来源。

## 契约测试

同一份 element definition 必须分别通过 eager 与 lazy adapter 运行以下矩阵：

- 默认值、property upgrade、attribute coercion、boolean 与 custom serializer；
- reflection、事件、exposed methods 与 form callbacks；
- connect/disconnect/reconnect cleanup；
- Shadow Slot；
- Light DOM 默认/具名 slot 的动态增加、删除和改名。

测试比较可观察 DOM、property、attribute、event 与 cleanup 结果，不比较 adapter 内部结构。

## 非目标

- Declarative Shadow DOM、SSR/hydration；
- 对对象/数组做通用 attribute JSON 序列化；
- 为旧 eager/lazy 分叉协议保留兼容 bridge。
