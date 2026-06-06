# docs/internal

Zeus 内部设计文档、历史阶段材料与问题追踪。

## 当前权威文档

优先阅读这些文档。它们描述当前认可的设计和实现方向。

| 文档                                                                              | 说明                                                                   |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Web Component 定义协议](./primitive-component.md)                                | 当前 `defineElement` / primitive component / wrapper / manifest 协议。 |
| [Package Consolidation](./package-consolidation.md)                               | 当前包边界、推荐用户入口与内部包整理策略。                             |
| [Web Component Protocol Release Notes](./release-notes-web-component-protocol.md) | 本次 Web Component 协议收敛的发版前说明草案。                          |
| [Stencil Wrapper Output Reference](./stencil-wrapper-output-reference.md)         | Stencil 输出机制分析，以及 Zeus 已采纳/未采纳的参考点。                |

## 历史设计材料

这些文档保留上下文，但不再作为最终协议来源。若与“当前权威文档”冲突，以当前权威文档为准。

| 路径                                                                                           | 说明                                          |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [design/primitive-component-protocol.md](./design/primitive-component-protocol.md)             | Primitive protocol 早期协议草案。             |
| [design/primitive-component-implementation.md](./design/primitive-component-implementation.md) | Primitive protocol 早期实现草案。             |
| [design/web-c-architecture.md](./design/web-c-architecture.md)                                 | Web-C 聚合包和架构早期设计。                  |
| [design/lazy-load.md](./design/lazy-load.md)                                                   | lazy Web-C runtime 的历史设计细节。           |
| [stage05-component-compiler-host/](./stage05-component-compiler-host/)                         | 组件编译器宿主阶段设计、review 和路线图记录。 |
| [review/](./review/)                                                                           | 针对特定主题的历史 review。                   |
| [issues/](./issues/)                                                                           | 内部问题记录与修复计划。                      |

## 文档维护规则

- 新的协议结论优先更新当前权威文档。
- 历史设计文档不需要跟随每次实现同步，只用于追溯“当时为什么这么想”。
- 如果历史文档中的方案已被替代，不要新建兼容说明，直接在权威文档写当前唯一设计。
- Zeus 仍处于 beta 阶段且无真实迁移用户，不为旧文档草案保留 API 兼容承诺。

## 创建新阶段

使用项目根目录脚本：

```sh
pnpm run new:stage <number> <task-name>
```

示例：

```sh
pnpm run new:stage 06 headless-components
```

这会创建：

```txt
docs/internal/stage06-headless-components/
├── design/
├── review/
└── roadmap.md
```
