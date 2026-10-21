# 路线图完成性审计（2026-10-21）

总目标仍进行中。初始审计基线为 Zeus `dc70175`、Zeus UI `3fc286e`；依据原始
`zeus-architecture-roadmap-2026-10-16/01-TASKS.md` 与 `02-DESIGN.md`，并保留
[执行表](./architecture-roadmap-2026-10.md) 中的原 Task ID。绿灯只证明其覆盖的范围。
Beta 无历史兼容层规则优先于原设计中的兼容窗口建议。

## 2026-10-20 增量复审

本次复审在 Zeus `2b81d126`、Zeus UI `053e9ce` 工作区及未提交的路线图实现改动上执行。
`pnpm check:admin` 的 Chromium/Firefox/WebKit 生产产物验收通过；SSR runtime/Vite 定向测试
45/45、Rust compiler transform 50/50、packed consumers 的 Native/React18/React19/Vue3
安装、类型、构建、SSR 与三浏览器门禁均已取得本地证据。真实 registry Golden runner
仍不能作为完成证据：已发布 UI `0.1.0-beta.32` / Zeus `0.1.1-beta.13` 的 React18/19
Node SSR import 失败，Vue3 三浏览器的 named prefix/suffix projection 失败；这些失败来自
已发布 tarball，当前工作区的 Vue wrapper 修复尚未发布。npm 当前未认证（`npm whoami`
返回 401），因此不能将 B-003、E-009 或总目标标记为完成。

## 2026-10-21 增量复审

官方 npm 源 `https://registry.npmjs.org` 已认证为 `baicie2`，固定包 ACL 显示 read-write；
账户 2FA 当前关闭。`Repair Native Latest` run `39535665906` 与官方源本地脚本均在删除
`@zeus-js/compiler-native` 的历史 `latest` 时收到 npm E403，因此 F-011 仍未完成；其他包的
tag 尚未被脚本改动。`pnpm check:golden-components` 重跑时，四个消费者在读取 GitHub 源码
快照阶段因网络 fetch 失败中止；这次结果不能替代先前已记录的真实 registry 失败，也不能证明
已发布 tarball 的 React SSR 或 Vue Slot 问题已经修复。

Zeus UI 工作区的 Phase 11 实现与测试已加入，但 beta.33 下直接执行的 7 项 jsdom runtime
测试全部失败：FormField 的控件 ID/ARIA 未落到原生控件，DropdownMenu 首次挂载遇到
`ZEUS_WC_DISCONNECTED_BEFORE_READY`。追查到当前 UI registry 依赖的 Zeus beta.15
`mountElementDefinition` 使用会清空宿主的 `render()`；Zeus 当前分支已加入保留 light-DOM
原始子节点的修复，须先经合并/发布或隔离消费者验证，再重新判定这些 runtime 测试。Phase 13
的主题生成器和安全的 `theme add` 流程已存在并通过对应检查。UI 改动仍在 zeus-ui 工作区，
尚未发布 beta.33 或稳定版，亦未完成发布后消费者验证。

## 原始验收状态

| 项目              | 现有证据与明确缺口                                                                                                                                                                                                                                    | 后续证明要求                                                                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-003 / M2 Golden | 真实 registry Golden 已执行，但验收失败：UI `0.1.0-beta.32` / Zeus `0.1.1-beta.13` 的 React18/19 无 DOM Node SSR import 失败，Vue3 的 named prefix/suffix projection 在 Chromium/Firefox/WebKit 失败；Native 与 React 浏览器故事通过                  | 修复已发布版本上的 React SSR 与 Vue Slot 问题，重新发布并对 Button/Input/Dialog/DataGrid tarball 完成 Native/React18/React19/Vue3、SSR/types/build、三浏览器与来源验证                                                                                                                           |
| F-007             | **已关闭（2026-10-20）**：生产 Next 示例区分无需/需要 `use client`，禁用 JS宿主、升级、事件、DOM identity 与 hydration 错误三浏览器通过                                                                                                               | `examples/next-boundary`、`pnpm check:next-boundary`                                                                                                                                                                                                                                             |
| F-011             | **发布链已完成，历史 native latest 清理仍阻塞**：Canary `0.1.1-canary.20261020.192.1.98809087` 发布、promote、Sigstore provenance、Node22/24 registry smoke、下游 dispatch 全通过；29 个 fixed 包 dist-tag 复核通过                                   | run `39376347136`；官方源账户 `baicie2` 与固定包 read-write ACL 已验证，但账户 2FA 关闭；Repair run `39535665906` 和本机官方源删除均返回 npm E403，`latest` 仍指向 `0.1.1-canary.20260812.106.1.658fe407`                                                                                        |
| D-003             | **已关闭（2026-10-20）**：可视面板与真实编译器 `dynamic-region` 追踪；三浏览器点击 DOM 显示 Binding/Effect/Signal                                                                                                                                     | `pnpm check:devtools-panel`、PR #134/#137                                                                                                                                                                                                                                                        |
| D-005             | **已关闭（2026-10-20）**：Quick Start 五片段全部映射到模板执行，四模板 typecheck/build/test，WC auto 与全部输出验证                                                                                                                                   | `pnpm check:quick-start`、CI 四模板 smoke、PR #138                                                                                                                                                                                                                                               |
| D-006             | 产品边界与上手文档已构建；用户确认暂时无法安排首次接触 Zeus 的用户进行计时上手                                                                                                                                                                        | “新用户15分钟”需真实用户测试及匿名步骤/耗时记录；按用户要求保留未完成，不得据此将总目标标为完成                                                                                                                                                                                                  |
| D-007             | **已关闭（2026-10-20）**：真实 runtime 依赖 bundle 测量；五视图、复制、分享 URL/reload、键盘和失败路径三浏览器通过                                                                                                                                    | `pnpm playground:check`、`pnpm playground:smoke`                                                                                                                                                                                                                                                 |
| E-006             | **已关闭（2026-10-20）**：Rust SSR codegen/native 执行覆盖 defineElement、Host/Slot、DSD、definition option CSS 与首屏控件状态；runtime SSR 覆盖 Manifest 驱动的 shadow、defaults 和反射属性                                                          | `packages/core/compiler-native/__tests__/integration.test.cjs`、`packages/core/runtime-ssr/__tests__/runtime-ssr.spec.ts`、`packages/devtools/vite-plugin/__tests__/ssr-execution.spec.ts`；`styles`/`styleNonce` 是 definition options，不属于 Manifest；SSR 不模拟 `ElementInternals` 生命周期 |
| E-007             | **已关闭（2026-10-20）**：`hydrationPlan` 在 DOM/SSR 间共享稳定 Template/Node/Binding ID，SSR 自动写 marker；`hydratePlan` 逐 binding 重连并释放失败 setup；真实 Chromium/Firefox/WebKit 保持首屏、焦点、选区、DOM identity、events、props 和 cleanup | `transformModule()`、`hydratePlan()`、`pnpm check:hydration`；Streaming 按设计后置                                                                                                                                                                                                               |
| E-008             | **已关闭（2026-10-20）**：Admin 集成真实 Zeus UI Input/Dialog/DataGrid 与 Resource/Query，包含查询/筛选/分页/选择、编辑/保存及权限流程；生产产物三浏览器检查已接入 CI                                                                                 | `examples/admin`、`pnpm check:admin`；该结论只覆盖当前仓库示例及其 CI 验收，不代表 UI 包的 registry 发布或来源验证                                                                                                                                                                               |
| E-009             | 真实 registry tarball 的独立安装、来源/供应链读取和消费者矩阵已运行；结果记录在 `temp/golden-components/report.json`，但 React18/19 SSR import 与 Vue3 三浏览器具名 Slot 断言失败，故未完成                                                           | 修复并发布对应包后，重新运行 `pnpm check:golden-components`，要求所有 required assertions、版本、source commit 与 provenance 均通过                                                                                                                                                              |

## 2026-10-21 后续状态复核

随后复核时，`npm whoami --registry=https://registry.npmjs.org/` 返回 E401。此前同日曾成功认证
为 `baicie2` 并读取到包 ACL；该结果只代表当时会话，不能作为当前发布或删除 dist-tag 的认证证明。
Zeus PR #143 已合并至 `main`（merge commit `40f887b`），合并前最新 build、test、lint、Rust、
packed-consumers 与 Admin 浏览器检查通过；Zeus 本地 `main` 与 `origin/main` 同步且工作区干净。

registry 仍显示 `@zeus-js/zeus` beta 为 `0.1.1-beta.15`，`@zeus-js/compiler-native` 的 `latest`
仍指向 `0.1.1-canary.20260812.106.1.658fe407`；此前清理该 tag 的 workflow 和本机请求均曾返回
E403。Zeus UI 的 `@zeus-web/ui` beta 仍为 `0.1.0-beta.32`，查询 `0.1.0-beta.33` 返回 E404；
beta.33 尚未发布，稳定版及发布后 registry/provenance 验收也未完成。

B-003/E-009 仍须在修复版 Zeus 与 UI 新 tarball 发布后重跑完整 Golden 消费者矩阵及来源验证；
旧 beta.32/beta.13 的失败记录不能替代新版本验收。D-006 的新用户 15 分钟计时由用户确认
暂时无法安排，必须保留未完成；因此本总目标仍未完成。

## 2026-10-22 当前复核

- Zeus PR #145 已合并到 `origin/main`，当前提交为 `61015c2`；本地 `main` 已同步且工作区干净。
  该提交触发的 Release Canary run `39655474019` 中 release-preflight 与 8 个 native prebuild 已通过，
  release-canary 仍在运行。beta.16 尚未发布；官方 npm 源的 `npm whoami` 仍返回 E401，因此不能执行
  真实发布、provenance 核验或删除 `@zeus-js/compiler-native` 的历史 `latest` 标签。
- Zeus UI PR #111 的 `codex/ui-beta33-release-prep` head 为 `ab948db`，修复 Data Grid benchmark contract
  中残留的 beta.32 版本断言；本机 759/759 Node unit、定向 benchmark contract 7/7、format/check 通过，
  Windows CI 的 Node 和 jsdom 阶段通过，但 PR 仍为 OPEN/BLOCKED。
- PR #111 的 Linux unit-test 仍在第一步 Data Grid E2E 失败：Zeus beta.15 diagnostics 默认路径调用
  `performance.now()` 318 次；修复已在 Zeus `main`，需发布 beta.16 后重锁依赖并重跑。React showcase
  的完整 route smoke 在 `/playground` 后进入 Select 路由时偶发 Promise 微任务重入；单路由和拆分序列可通过，
  当前证据不足以安全修改 UI 业务代码，待修复版 runtime 集成后复验。
- B-003、E-009、F-011 和总目标继续未完成；D-006 按用户要求保持未完成。需完成 beta.16/UI beta.33 发布、
  provenance 与完整 Golden 消费者矩阵，并取得 D-006 真实新用户计时记录后，才能关闭这些项目。

D-009 审计另复现了注释换行触发 ASI、编译指令变化、嵌套模板/JSX 被误判安全的缺陷。
已以 Babel parser 注释范围替代启发式扫描，87 项插件测试及独立审阅通过；解析失败仍重挂载。`$state` 实现不在
原任务要求内；原任务只要求 RFC，不为凑齐数量添加隐式语义。

## UI 仓库路线图的真实欠项（2026-10-20 复核）

不仅检查 U 编号，还核对 UI 的 MVP、fix-mvp、advanced、examples 与 showcase roadmaps，
以及 Zeus Component Host Phase 10/11：

本次 UI 复核基于独立仓库 `zeus-ui` 的 `main` 提交 `053e9ce`（相对
`origin/main` ahead 1）；该提交只更新路线图状态，代码证据来自其此前已合并的
Phase 10/12/14 实现。以下命令均在 `zeus-ui` 根目录执行并通过：
`check:registry`、`check:component-coverage`、`check:cli-maintenance`、
`check:cli-consumer`、`check:cli-update-diff`、`check:cli-init`、`check:cli-add`、
`check:exports`、`check:build-output`、`check:product-contract`、
`check:advanced-final-contract`、`docs:check`、`release:verify --strict`、
`check:phase24-release`。

- Phase 12 的 CLI 维护链已实现：`remove/list/diff/update/doctor`、`add --all/--path/--registry/--yes/--skip-deps/--force`、
  `zeus-ui.lock.json` source snapshot/file hash、内置/文件/HTTP(S) registry resolver 均存在；独立仓库的
  `check:cli-maintenance`（124 项）、`check:cli-consumer`、`check:cli-update-diff`、`check:cli-init`、
  `check:cli-add` 与 Registry/exports/build-output contract 已通过。此前关于“没有 remove/remote registry”的结论已过期。
- Registry 当前覆盖 24 个条目、29 个 primitive；Phase 11 的 `form-field`、`popover`、`dropdown-menu`、`toast`
  已补齐依赖、交互/a11y、Registry/AI/双语文档、模板和 playground contract，并由
  `check:registry`、`check:component-coverage`、`check:product-contract`、`release:verify --strict`
  与 `check:phase24-release` 验证。`component-coverage` 中 advanced package-only warning 仍是既有 beta 约束。
- Phase 13 已有 `theme list/tokens/set`、radius/accent/motion/dark-mode、JSON token 输出、主题生成器和
  带路径安全校验的自定义 `theme add` 流程；当前工作区的实现与对应 CLI/主题测试已通过，待提交并在发布后复验。
- Phase 14 `@zeus-web/icons` 已提供 React/Vue/WC/raw SVG/Manifest、Registry icon 模板、AI metadata 与 CLI
  list/search/show；需在发布后复验独立 tarball 的生成产物和消费者矩阵。
- UI 的 Phase 15 仍处于 beta 收口：`release:verify --strict`、`check:phase24-release`、docs/contract/consumer
  检查在 beta.32 本地通过，但 `0.1.0` 稳定版发布及发布后 registry/provenance 验证尚未发生。
- UI 依赖仍固定 Zeus beta.13；完成框架发布后需对齐不可变 registry 版本，重建、执行
  全量 CI、真实 Golden 消费者和 GitHub 发布/来源验证。

## 当前切片的证据口径

`pnpm check:hydration` 使用当前构建产物、显式 binding 计划和真实 Chromium/Firefox/WebKit，
验证禁用 JS 的 SSR/DSD 与原生 Slot 分配、输入焦点与选区、DOM identity、属性/Signal、mismatch、cleanup。
2026-10-20 重建后三浏览器通过；显式 hydration、events 与 DevTools 共 28 项定向测试通过，
覆盖 cleanup 异常保留原始 mismatch、父 scope 释放和无效 scope 的 owner 配对。
编译器 plan 由 Rust DOM/SSR 一致性测试、native contract 和 hydration runtime 单测覆盖；
浏览器脚本验证 plan handler 在当前构建产物中的真实行为。它仍然不使用真实 UI Golden 组件。
报告为 `temp/hydration/report.json`，CI 保存同目录 artifact。

建议依赖顺序：修 HMR/显式 hydration → CLI 锁安全 → registry/组件依赖 → Golden/Next/
文档与 DevTools/Playground → 编译器 SSR/Hydration → 框架/UI发布与对齐 → 完整验收 →
分支及工作区核验 → 最后关闭计划和总目标。并行可独立完成的切片，无需等待发布权限。

## 2026-10-22 发布与路线图复核

- Zeus 已在 `main` 提交 `a6f97c7` 创建 `v0.1.1-beta.16` tag 并推送。`pnpm release:precheck`
  本地通过（29 个发布包及 native binaries、151 个测试文件/1580 项测试、构建、类型、examples、
  docs、size、exports 等门禁）。GitHub Release run `39665117063` 仍处于 pending；官方 npm
  registry 查询 `@zeus-js/zeus@0.1.1-beta.16` 返回 E404，故尚无 registry 发布、provenance 或
  Node 22/24 registry smoke 证据。run `39665108731` 的 Release Canary 与 `39665117063` 共用
  `npm-release` concurrency group；Canary 仍在 `Publish canary` 步骤，beta 发布在其完成后继续。
- 当前官方 registry dist-tag 仍为 Zeus beta `0.1.1-beta.15`、canary
  `0.1.1-canary.20261021.198.1.581e0001`；`@zeus-js/compiler-native` 的 `latest` 仍指向
  `0.1.1-canary.20260812.106.1.658fe407`。历史 tag 清理仍未完成。旧失败 canary run
  `39655474019` 的 staging tag 仍在 npm tag 列表中，待发布链完成后核实并按脚本清理。
- Zeus `main` 的 CI `39665108632`、Docs `39665108442`、Native Matrix `39665108465` 和 Component
  Host Bench `39665108770` 均成功。beta.16 Release 与新 Canary 的最终结果尚未产生。
- Zeus UI PR #111 仍 OPEN，head `ab948db`。当前 GitHub CI 的唯一实质 Linux 失败是 Data Grid
  diagnostics 默认关闭时仍观察到 `performance.now()` 318 次（旧 beta.15 runtime）；修复已包含于
  Zeus beta.16 候选 `a6f97c7`，但必须待其公开后对齐依赖并重跑。完整 React showcase route smoke
  仍有不可稳定复现的 Promise 微任务重入，不允许跳过或放宽断言。UI Phase 15 稳定版及发布后
  registry/provenance/独立消费者验证仍未完成。
- 全路线图复审未发现额外未完成切片：剩余项目仍是 B-003/E-009 的真实 Golden tarball 矩阵、
  F-011 的历史 native `latest` 清理、D-006 的首次接触用户 15 分钟计时，以及 beta.16、UI beta.33
  和 UI 0.1.0 发布后的验证。用户再次明确表示暂时无法安排首次用户测试，并指定 D-006 留未完成。
  因此 D-006、B-003、E-009、F-011 与总目标均不得标记完成。

## 2026-10-22 beta.16 与 UI 对齐复核

- Zeus `v0.1.1-beta.16` Release run `39665117063` 已成功，`@zeus-js/zeus@0.1.1-beta.16` 和
  `@zeus-js/compiler-native@0.1.1-beta.16` 已在官方 registry 可读；新 Canary run `39669096549`
  仍在运行。`@zeus-js/compiler-native` 的 `latest` 仍是旧 canary，F-011 仍未完成。
- Zeus main CI `39669096532` 的唯一失败是 GitHub WebKit Admin 选择断言；本机三浏览器 `pnpm check:admin`
  和重复 WebKit 流程通过，已保留原断言并安排重跑，不能把本地通过替代 CI 结果。
- UI PR #111 已推送 head `95d478a`：所有 31 个 workspace 包、根开发依赖、peer range、lockfile 和
  `check:zeus-beta-alignment` 默认基线统一到 Zeus beta.16。frozen install、11/11 对齐测试、Data Grid
  114/114 E2E、TypeScript、`release:verify --strict` 和 `check:phase24-release` 均通过；完整 `test-unit`
  与 PR 新 CI 尚未结束。UI beta.33 和稳定版尚未发布。
- 本轮 Golden runner 仍使用 registry UI beta.32，结果继续是 React18/19 SSR import 失败和 Vue3 三浏览器
  prefix/suffix projection 失败；由于 beta.33 尚未发布，不能据此宣称新版本验收通过。B-003/E-009 仍需
  UI 发布后重新产生完整 tarball、source/provenance 和四消费者报告。
- 当前 `npm whoami --registry=https://registry.npmjs.org/` 返回 E401，无法在本机发布 UI 或删除历史
  native `latest`。D-006 仍缺真实新用户 15 分钟匿名记录，按用户明确要求保留未完成；因此 B-003、
  E-009、F-011、D-006 和总目标均不得标记完成。

## 2026-10-22 最终 main Canary 复核

- PR #148 已合并为 main `3e0e622`。Release Canary run `39679103278` 的 Native prebuild、发布、
  provenance、Node 22/24 registry smoke 和下游 dispatch 全部成功；`canary` 为
  `0.1.1-canary.20261021.202.1.3e0e6220`。
- `@zeus-js/compiler-native` 的 `latest` 仍为历史 canary
  `0.1.1-canary.20260812.106.1.658fe407`，官方源本机认证仍 E401，F-011 清理未完成。
- UI PR #111 当前 head `6f751d4`，已修复 DropdownMenu 方向键打开和 FormField caller-owned
  状态覆盖问题并通过定向测试；完整 PR CI 正在重跑。UI beta.33/稳定版未发布，B-003/E-009
  的新 registry Golden、来源与消费者报告仍待完成。
- 用户已明确无法安排首次接触 Zeus 用户的 15 分钟计时，D-006 按要求保持未完成；因此
  B-003、E-009、F-011、D-006 和总目标均不得标记完成。
