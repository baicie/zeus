# 未决问题与需要用户决策的事项

分三类：**Q** = 需要用户决策（影响 Phase 1 的迁移清单）；**U** = 技术上未取证（可在 Phase 1 补齐）；**D** = 设计包本身需要修订的地方。

---

## 一、需要用户决策（Q）

### Q1 — 0.2.0 线未发布，Phase 4 如何开始？（阻断）

ecosystem 的核心约束是「只消费已发布的包」。当前 npm 上 `@zeus-js/zeus` 没有任何 `0.2.0` 版本，
`@zeus-web/*` 最新是 `beta.34`。admin 用 `workspace:*` 与 `file:` vendor 才跑得起来。

选项：

| 选项                                       | 代价                         | 风险                                       |
| ------------------------------------------ | ---------------------------- | ------------------------------------------ |
| A. 先发布 0.2.0 RC + `@zeus-web/*@beta.35` | 需要走完整发布链路与配对流程 | 发布本身有风险，但这是设计包预设的正常路径 |
| B. 迁移期允许 ecosystem 用 git tag 依赖    | 违反核心约束，但可控         | 会形成「临时例外」惯性                     |
| C. 迁移期允许 ecosystem 用 vendor 方式     | 同上，且 vendor 会扩散       | 最差选项                                   |
| D. 推迟 Phase 4，先做 Phase 2/3            | 不解决根本问题               | 低                                         |

**建议 A。** 但需要你确认发布窗口。

### Q2 — `playground-editor` 归 zeus 还是 ecosystem？

它是框架旗舰 demo（WASM 编译器 + 沙箱），但形态是完整应用：独立镜像、生产域名、独立 Pages 仓库、
SSH 部署、6 个 Playwright 门禁（2822 行）。

- 设计包 `docs/04-ci-deployment-evidence.md:53-54` 明写「zeus 不再承担应用镜像部署」
- 但 `docs/01-repository-boundaries.md:49-50` 又要求 zeus 保留「Runtime、Compiler、API 的可复现用例」

**这两条对 Playground 给出相反结论。** 需要你定：

| 选项                                        | 后果                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------- |
| A. 留 zeus                                  | zeus 保留 1 个生产部署，与「zeus 不承担应用部署」冲突，需要修订设计包 |
| B. 迁 ecosystem                             | zeus 失去唯一的编译器端到端演示；ecosystem 多一个高复杂度应用         |
| C. 拆分：代码留 zeus，镜像/部署迁 ecosystem | 两边都要跨仓，复杂度最高                                              |

### Q3 — `zeus-ui/examples` 要不要搬？

它们被 4 个检查脚本与根 `site:check` 锁定，且是 registry/CLI 同步链路的下游。
搬走会打断 `site:check`、`showcase:ci`、`check-product-contract`。

| 选项                                           | 后果                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| A. 全部留在 zeus-ui                            | zeus-ui 继续承担 16 个 examples；与「UI 仓只管组件与文档」有张力，但它们确实是组件演示 |
| B. 搬 react/vue/advanced showcase 到 ecosystem | 需要重写 4 个检查脚本；registry 同步链路断裂                                           |
| C. 只搬 ai-workbench + ai-host                 | 最小改动，只影响 unit-jsdom 的一个 include 与 ai-workbench 工作流                      |

**建议 C。** showcase 是组件演示，符合 zeus-ui 定位；ai-workbench 是应用，不符合。

### Q4 — `create-zeus` 模板的 `@zeus-web/button` 依赖怎么处理？

`create-zeus` 是 zeus 的发布物，其模板钉了 UI 仓的包。这使「zeus 不依赖 zeus-ui」在产品层面不成立。

| 选项                                                   | 后果                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| A. 保留，写入兼容矩阵                                  | 承认 zeus 的脚手架模板依赖 UI 包，作为受控例外 |
| B. 模板改为只用 `@zeus-js/*` 的最小示例                | 失去「Web Components 消费示例」的脚手架价值    |
| C. 把 `webc-consumer-ts` 模板迁到 ecosystem 或 zeus-ui | 脚手架少一个模板                               |

### Q5 — 新仓库名、公开/私有、Secrets 归属、是否保留 Git 历史

设计包 `docs/07-assumptions-open-questions.md:65-73` 已列出，本轮审计不改变这些问题的性质。
需要你确认：

1. 仓库名是否用 `zeus-ecosystem`
2. 公开还是私有（注意：`demos-pages.yml:98-107` 依赖 zeus-ui **公开可匿名克隆**）
3. 生产部署的 environment 与 secrets 由谁保管（当前 3 个产品共用一套宿主凭据，见 R-23）
4. 是否要求保留 Demo 的完整 Git 历史
5. 生产切换窗口与回滚观察期

### Q6 — 四个空壳样例是否废弃？

`vanilla`（14 行）、`vite-react`（98 行）、`vite-vue`（115 行）、`vite-vue2`（43 行）：
无 check、无 test、无 CI。`vite-vue2` 名实不符（声称 Vue 2，实为 Vue 3）。

`retire` 需要你确认——它们可能被外部文档或教程引用。

---

## 二、技术上未取证（U）

可在 Phase 1 补齐，不阻断决策。

| ID  | 问题                                                                    | 补齐方式                                                |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| U1  | `@zeus-js/output-*` 是否被运行时 import（影响 30 个发布包的依赖树）     | 对每个包 grep `dist/**/*.js` 的 import                  |
| U2  | `check-dialog-interaction.ts` 是否覆盖 ARIA 与滚动锁                    | 通读 1276 行剩余部分                                    |
| U3  | `check:playground-api`、`check-playground-performance` 是否在 CI 执行   | 已在 workflow grep 无命中；需确认是否被其他脚本间接调用 |
| U4  | `playground-online-acceptance.ts`（1028 行）为何未接入 CI               | 查 git log 与 docs/release                              |
| U5  | `e2e/examples/vite-react/input-event.spec.ts` 未被 CI 调用是否有意      | 查 git log                                              |
| U6  | `e2e/advanced/data-grid/test-virtual-focus.spec.ts` 是否为遗留调试 spec | 读文件 + git log                                        |
| U7  | `zeus-ui/temp/` 86 个目录中哪些仍被脚本依赖                             | grep 脚本中的 `temp/` 路径                              |
| U8  | `zeus` 的 pairing 读取端是否同时识别 `meta/release/pairing/` 与旧路径   | 读 `write-pair-attestation.ts` 的 `TAGGED_RECORD_PATHS` |
| U9  | `ADMIN_IMAGE_MAX_MB` 等 vars 的当前实际值                               | 需 GitHub 仓库设置权限                                  |
| U10 | 线上实际运行镜像 digest 与最后 workflow run 是否一致                    | 需 Actions 历史或访问服务器                             |
| U11 | `deploy/host-validation/` 是否被真实使用过                              | 查 git log 与 host-deployment-stage2 的 run 历史        |
| U12 | `[full-run]` 之外，`check:admin` 是否在任何 workflow 中允许失败         | 逐 job 核对 `continue-on-error`                         |
| U13 | `@zeus-web/ui` 只覆盖 button/input，但 docs 首页宣称 styled 全量入口    | 读 docs 与 `packages/ui/src` 确认叙事差                 |
| U14 | `apps/docs/ZeusPlayground.vue` 是否死代码                               | grep 全部 md/vue                                        |

---

## 三、设计包需要修订的地方（D）

这些不是「未取证」，而是审计已证明设计包与现状不符，需要在 Phase 1 前修订设计包本身。

| ID  | 设计包位置                                 | 原文                                                                       | 应改为                                                                                                                          |
| --- | ------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `README.md:39`、`docs/04:55`、`docs/07:14` | 「`admin-image.yml` 是当前唯一生产镜像部署」                               | 「有 3 个生产部署工作流、4 个镜像：admin、playground、ai-workbench + ai-host」                                                  |
| D2  | `README.md:33`、`docs/07:10`               | 「zeus-ui 的 29 个包依赖 `@zeus-js/*`」                                    | 「46 个可发布包，其中 30 个声明 `@zeus-js/*` 依赖」                                                                             |
| D3  | `README.md:34`、`docs/07:11`               | 「zeus 当前依赖 zeus-ui@0.1.0-beta.34」                                    | 删除该条；zeus 根包无依赖，仓内 `zeus-ui` 是脚手架 CLI。改为记录真实的 3 条反向依赖（admin、create-zeus 模板、scripts/release） |
| D4  | `README.md:31`、`docs/07:9`                | 「zeus 的框架包对 `@zeus-web/*` 零依赖」                                   | 「`packages/*` 零依赖；`create-zeus` 的发布模板依赖 `@zeus-web/button`」                                                        |
| D5  | `docs/01:35` 与 `docs/04:53-54`            | 要求 zeus 保留「Compiler 可复现用例」，又要求「zeus 不再承担应用镜像部署」 | 对 Playground 给出明确归属（见 Q2）                                                                                             |
| D6  | `docs/01:56-83`                            | zeus-ui 的目标目录只列 `packages/`、`apps/docs/`                           | 需说明 46 个包（含 7 个 ai-\*、5 个 advanced）与 16 个 examples 的归属                                                          |
| D7  | `docs/02:80`                               | 「`check:admin` 不得整体归属某一个仓库」                                   | 方向正确，建议补上实测数据：115 条断言、42 组、component 30 / framework 30 / integration 49 / application 6                     |
| D8  | `docs/03:44`                               | 「Beta 阶段建议在消费者 package.json 中固定明确的 prerelease 版本」        | 现状**已满足**：所有跨仓依赖都是精确 pin，无 range。可作为既有成绩记录                                                          |
| D9  | `docs/04:71-83`                            | Admin 生产切换 8 项门槛                                                    | 需扩展为 3 个产品各自的门槛，且必须处理 R-03（framework 断言失去宿主）                                                          |
| D10 | `docs/06:5`                                | 「`zeus` 不依赖任何 `@zeus-web/*` 包」                                     | 需注明 `create-zeus` 模板例外，或先处理 Q4                                                                                      |
| D11 | 全篇                                       | 未提及 `@zeus-ui` scope 归属与 `zeus-ui` 包名占用                          | 新增一节：scope 与包名治理                                                                                                      |
| D12 | 全篇                                       | 未提及 `zeus-ui/examples` 被检查脚本锁定的约束                             | 在 `docs/02` 补充：搬 examples 需同批改 4 个检查脚本                                                                            |

---

## 四、本轮审计没有回答的问题（明确的边界）

以下不在 Phase 0 范围内，不应被理解为「审计通过」：

1. **代码质量**：`packages/*/src`、`crates/`、`examples/*/src` 的实现质量未评估
2. **测试有效性**：只统计了断言数量，未判断断言是否真的能捕获回归（除了发现 1 处恒真断言）
3. **性能**：未测量任何应用的运行时性能、构建时间、包体积
4. **安全**：只记录了安全机制的存在（scrypt、CSRF、CSP、opaque origin），未做渗透或威胁建模
5. **文档质量**：`docs/` 下 30 个目录未审计
6. **线上状态**：未访问任何生产环境，未核对实际部署与仓库的一致性
7. **历史决策**：未读 `docs/adr/`、`docs/architecture/r16-r25` 的完整历史

## 建议的 Phase 1 起点

按依赖关系，Phase 1 应按此顺序回答：

1. **Q1（0.2.0 发布）** — 决定一切后续能否开始
2. **Q2（Playground 归属）** + **Q3（examples 归属）** — 决定迁移清单的范围
3. **Q5（新仓库边界）** — 决定 CI/Secrets 怎么拆
4. **D1-D12（修订设计包）** — 把已经失真的基线改对，否则 Phase 2 之后会反复踩空
5. **Q4（create-zeus 模板）** + **Q6（空壳样例）** — 收尾决策

在这五项完成前，不建议启动任何写操作阶段的提示词。
