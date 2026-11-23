# 需要你拍板的决策

共 5 项。每项给出选项、代价、我的建议，以及「不做决定会怎样」。

---

## D-01 — 是否批准本 Phase 1 清单

**问题**：`01-final-inventory.md` 与 `02-migration-matrix.csv` 的归属是否认可？

**我的建议**：批准，但可先只批准 2a/2b（headless 系）与 3（ecosystem 骨架），
把 admin 与 ai-workbench 留到你看过 Phase 2 结果后再定。

**不决定的后果**：Phase 2 无法开始。

---

## D-02 — `playground-editor` 留 zeus 还是迁 ecosystem

**背景**：它是完整应用（独立镜像、生产域名 `playground.moonbyte.top:8443`、独立 Pages 仓、
6 个 Playwright 门禁共 2822 行），但对 `@zeus-web/*` **零依赖**，且是编译器能力的旗舰演示。

设计包内部对它给出相反结论：

- `docs/04-ci-deployment-evidence.md:53-54`：「zeus 不再承担应用镜像部署」
- `docs/01-repository-boundaries.md:49-50`：zeus 保留「Runtime、Compiler、API 的可复现用例」

| 选项                   | zeus 侧代价                    | ecosystem 侧代价                                            | 设计包                 |
| ---------------------- | ------------------------------ | ----------------------------------------------------------- | ---------------------- |
| **A. 留 zeus（建议）** | 保留 1 个生产部署与 2 个工作流 | 少一个高复杂度应用                                          | 需修订 `docs/04:53-54` |
| B. 迁 ecosystem        | 失去唯一的编译器端到端演示     | 需重建 WASM 构建链（依赖 `crates/` + `packages/` 全量源码） | 需修订 `docs/01:49-50` |
| C. 拆分                | 代码留 zeus                    | 镜像/部署迁 ecosystem                                       | 两边都跨仓，复杂度最高 |

**建议 A 的额外理由**：Playground 的 `Dockerfile:9-23` 复制 `crates/`、`packages/`、`scripts/` 全量源码。
它**无法脱离 zeus 的 monorepo 构建**。迁到 ecosystem 意味着 ecosystem 必须 checkout zeus 源码，
这正是设计包要消除的反向依赖。

**不决定的后果**：Phase 5d（补 revision label）与 Phase 7（清理）无法定范围。

---

## D-03 — 是否废弃 5 个空壳/对照样例

| 对象                            | 现状                                        | 废弃依据                  |
| ------------------------------- | ------------------------------------------- | ------------------------- |
| `zeus/examples/stencil-wrapper` | 0 个 `@zeus-js` 依赖，是 Stencil 产物对照物 | 完全不用 Zeus，与框架无关 |
| `zeus-ui/examples/vanilla`      | 14 行，无 check/test/CI                     | 无门禁                    |
| `zeus-ui/examples/vite-react`   | 98 行，无根脚本                             | 无门禁                    |
| `zeus-ui/examples/vite-vue`     | 115 行，无根脚本                            | 无门禁                    |
| `zeus-ui/examples/vite-vue2`    | 43 行，**声称 Vue 2 实际依赖 Vue 3**        | 名实不符                  |

| 选项                                      | 代价                            |
| ----------------------------------------- | ------------------------------- |
| **A. 全部废弃（建议）**                   | 可能被外部教程引用，需检查 docs |
| B. 只废弃 `vite-vue2`（名实不符证据最硬） | 保留 4 个无门禁样例             |
| C. 全部保留                               | 维护无意义资产                  |

**建议 A**，但执行前需 `grep` 全仓文档确认无引用。`vite-vue2` 可无条件废弃（描述与依赖矛盾）。

**不决定的后果**：Phase 7 清理范围不定。

---

## D-04 — `create-zeus` 模板的 `@zeus-web/button` 依赖

**事实**：`packages/create/create-zeus/templates/webc-consumer-ts/package.json:13` 钉了
`@zeus-web/button: 0.1.0-beta.34`，而 `create-zeus` 的 `files: ['dist', 'templates']` 会把它发布出去。

这是**已发布产品**对 UI 仓的依赖，只搬 admin 消不掉。

| 选项                             | 后果                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| **A. 保留 + 登记例外（建议）**   | 承认 zeus 的脚手架模板依赖 UI 包；写入兼容矩阵；`check-structure` 需允许该例外 |
| B. 模板改为只用 `@zeus-js/*`     | 失去「Web Components 消费示例」的脚手架价值                                    |
| C. 模板迁到 zeus-ui 或 ecosystem | 脚手架少一个模板；`check:create-zeus-candidate` 需改                           |

**建议 A 的理由**：这个模板的价值正是「展示如何消费 `@zeus-web/*`」。
若改成 `@zeus-js/*`，它就不再是 Web Components 消费示例。
但必须显式登记，否则「zeus 对 `@zeus-web` 零依赖」的验收条件永远无法通过。

**建议的登记形式**：在 `docs/architecture/packages.md` 加一节「已登记的跨仓例外」，
列出：包名、依赖、理由、复审条件（如「zeus-ui 提供纯 `@zeus-js/*` 的 WC 消费模板后复审」）。

**不决定的后果**：Phase 7 的验收条件无法定义。

---

## D-05 — `@zeus-ui` scope 与 `@zeus-ui/headless` 迁入后的命名

**事实**：

| 包                   | 仓库    | private      | 内容                                                       |
| -------------------- | ------- | ------------ | ---------------------------------------------------------- |
| `@zeus-web/headless` | zeus-ui | 否（public） | **聚合器**：re-export 24 个 primitives，仅 `.` 导出        |
| `@zeus-ui/headless`  | zeus    | **是**       | **独立组件库**：6 个组件，有 `./wc`/`./react`/`./vue` 导出 |
| `@zeus-ui/registry`  | zeus    | 否（public） | registry 模板                                              |

两个 `headless` 是**不同产品**，不是同一个包的重复。

| 选项                                                  | 后果                                              |
| ----------------------------------------------------- | ------------------------------------------------- |
| **A. 迁入 zeus-ui，保留 `@zeus-ui/headless`（建议）** | zeus-ui 出现第二个私有 scope；需在 AGENTS.md 登记 |
| B. 迁入并改名为 `@zeus-web/headless-v2`               | 与现有 `@zeus-web/headless` 语义冲突              |
| C. 不迁，留 zeus                                      | 5 个消费者也留，与「zeus 不依赖 UI」冲突          |

**建议 A**。它是 private 包，不发布，不会污染 npm。代价是 zeus-ui 内有两个 scope，
但那只是命名约定问题，不影响发布契约。

**附带问题**：`zeus/packages/create/registry` 的包名是 `@zeus-ui/registry`，**且可发布**。
若采用 A，`@zeus-ui` 会被两个仓库使用。建议**同时**把 `@zeus-ui/registry` 改名为 `@zeus-js/registry`
（它是 create-zeus 的配套工具，属框架工具链）。**这需要你确认是否一并处理。**

**不决定的后果**：Phase 2a 无法开始。

---

## 附：需要你发起的两个外部动作

这两项不是「决策」，是**只有你能做**的操作：

### X-01 — 发布 `@zeus-js/*@0.2.0-rc.3`

源码树已是 `0.2.0-rc.3`，但 npm 上没有任何 `0.2.0` 版本。
这是门禁 G1 的一半，阻断 Phase 4 全部内容。

发布方式：`gh workflow run release.yml --ref main -f ...`（走 Release environment）。
需要你确认发布窗口。

### X-02 — 发布 `@zeus-web/*@0.1.0-beta.35`

源码树已是 `0.1.0-beta.35`，npm 上 `beta` 指向 `beta.34`。
这是门禁 G1 的另一半，阻断 vendor 删除与 admin 迁移。

发布方式：zeus-ui 的 `release.yml`（dispatch，`dry_run: false`）。
**注意**：Phase 0 发现 beta 频道与强制 `online` 配对存在矛盾（R-13），
**发布前必须先澄清**，否则第一次 beta 发布会失败。

---

## 汇总

| ID   | 问题              | 建议                     | 阻断                    |
| ---- | ----------------- | ------------------------ | ----------------------- |
| D-01 | 批准 Phase 1 清单 | 批准（可分批）           | Phase 2                 |
| D-02 | Playground 归属   | 留 zeus                  | Phase 5d、Phase 7       |
| D-03 | 废弃 5 个空壳     | 全部废弃                 | Phase 7                 |
| D-04 | create-zeus 模板  | 保留 + 登记例外          | Phase 7 验收条件        |
| D-05 | @zeus-ui scope    | 迁入保名 + 改名 registry | Phase 2a                |
| X-01 | 发布 0.2.0-rc.3   | 需你发起                 | Phase 4 全部            |
| X-02 | 发布 beta.35      | 需你发起（先澄清 R-13）  | vendor 删除、admin 迁移 |

**最小启动路径**：D-01 + D-05 → 可开始 Phase 2a/2b。
其余决策可并行推进，不阻塞 Phase 2。
