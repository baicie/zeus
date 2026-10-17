# Zeus RFC

本目录记录 Zeus 当前生效的框架语义。RFC 一旦标记为 `Accepted`，实现、测试、文档和包入口必须共同遵守；历史实现若与 RFC 冲突，应直接迁移，不保留 beta 阶段兼容层。

| RFC                                                        | 主题                                  | 状态     |
| ---------------------------------------------------------- | ------------------------------------- | -------- |
| [RFC-001](./RFC-001-component-execution-and-reactivity.md) | 组件执行、响应式与子树生命周期        | Accepted |
| [RFC-002](./RFC-002-jsx-to-ir.md)                          | JSX 到 Zeus IR                        | Accepted |
| [RFC-003](./RFC-003-web-components.md)                     | Web Components 语义                   | Accepted |
| [RFC-004](./RFC-004-server-side-rendering.md)              | 服务端字符串渲染                      | Accepted |
| [RFC-005](./RFC-005-rust-compiler.md)                      | Rust 编译器架构与迁移策略             | Accepted |
| [RFC-006](./RFC-006-reactivity-contract.md)                | 响应式 Primitive、Proxy 与 Owner 契约 | Accepted |
| [RFC-007](./RFC-007-wc-prop-contract.md)                   | Web Component 属性协议                | Accepted |
| [RFC-008](./RFC-008-tsx-values-and-spread.md)              | TSX 值语义与 Spread                   | Accepted |
| [RFC-009](./RFC-009-beta-stability.md)                     | Beta 稳定性与破坏性变更规则           | Accepted |
| [RFC-010](./RFC-010-wc-abi-v1.md)                          | Web Component ABI V1                  | Accepted |
