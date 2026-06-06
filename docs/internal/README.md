# docs/internal

Zeus 内部设计文档、历史阶段材料与问题追踪。

## 当前权威文档

优先阅读这些文档。它们描述当前认可的设计和实现方向。

| 文档                                                                              | 说明                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Web Component 定义协议](./primitive-component.md)                                | `defineElement` / primitive component / wrapper / manifest 协议的最终收敛版本。 |
| [Package Consolidation](./package-consolidation.md)                               | 包边界、推荐用户入口与内部包整理策略。                                          |
| [Web Component Protocol Release Notes](./release-notes-web-component-protocol.md) | 本次 Web Component 协议收敛的发版前说明草案。                                   |

## 历史设计材料

这些文档保留上下文，但不再作为最终协议来源。若与"当前权威文档"冲突，以权威文档为准。

| 路径                                                                                           | 说明                                          |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [design/primitive-component-protocol.md](./design/primitive-component-protocol.md)             | 早期 protocol 草案。                          |
| [design/primitive-component-implementation.md](./design/primitive-component-implementation.md) | 早期实现草案。                                |
| [design/web-c-architecture.md](./design/web-c-architecture.md)                                 | Web-C 聚合包早期设计。                        |
| [design/lazy-load.md](./design/lazy-load.md)                                                   | lazy Web-C runtime 历史设计细节。             |
| [stencil-wrapper-output-reference.md](./stencil-wrapper-output-reference.md)                   | Stencil 输出机制分析，已采纳/未采纳参考点。   |
| [stage05-component-compiler-host/](./stage05-component-compiler-host/)                         | 组件编译器宿主阶段设计、review 和路线图记录。 |
| [review/](./review/)                                                                           | 针对特定主题的历史 review。                   |
| [issues/](./issues/)                                                                           | 内部问题记录与修复计划。                      |

## 设计文档说明

### design/

| 文件                     | 说明                            |
| ------------------------ | ------------------------------- |
| `branching.md`           | Git 分支策略。                  |
| `bundle.md`              | 打包产物策略。                  |
| `canary.md`              | Canary 发布流程与 CI 集成。     |
| `package-collections.md` | pnpm catalog 共享依赖版本策略。 |
| `release.md`             | 发版流程与 check list。         |

## 文档维护规则

- 新的协议结论优先更新"当前权威文档"。
- 历史设计文档不需要跟随每次实现同步，只用于追溯"当时为什么这么想"。
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

```
docs/internal/stage06-headless-components/
├── design/
├── review/
└── roadmap.md
```
