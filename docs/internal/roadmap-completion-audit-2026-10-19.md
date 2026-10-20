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

官方 npm 源已确认使用 `https://registry.npmjs.org`，但 `npm whoami` 仍返回 401，
因此尚未具备发布或删除 dist-tag 的可核验权限。`pnpm check:golden-components` 重跑时，
四个消费者在读取 GitHub 源码快照阶段因网络 fetch 失败中止；这次结果不能替代先前已记录的
真实 registry 失败，也不能证明已发布 tarball 的 React SSR 或 Vue Slot 问题已经修复。

Zeus UI 工作区的 Phase 11 行为缺口已补齐：FormField 覆盖重复 ID、预置控件 ID、状态同步和
`aria-describedby` 清理；DropdownMenu 覆盖 roving `tabIndex`、打开时焦点、方向键、Home/End、
Escape 和选择后的焦点恢复。两个 primitive 的 7 项 jsdom 行为测试、构建、TypeScript、lint、
format、Registry 与 product contract 检查通过。Phase 13 的主题生成器和安全的 `theme add`
流程也已存在并通过对应检查。上述改动仍在 zeus-ui 工作区，尚未发布稳定版或完成发布后消费者验证。

## 原始验收状态

| 项目              | 现有证据与明确缺口                                                                                                                                                                                                                                    | 后续证明要求                                                                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-003 / M2 Golden | 真实 registry Golden 已执行，但验收失败：UI `0.1.0-beta.32` / Zeus `0.1.1-beta.13` 的 React18/19 无 DOM Node SSR import 失败，Vue3 的 named prefix/suffix projection 在 Chromium/Firefox/WebKit 失败；Native 与 React 浏览器故事通过                  | 修复已发布版本上的 React SSR 与 Vue Slot 问题，重新发布并对 Button/Input/Dialog/DataGrid tarball 完成 Native/React18/React19/Vue3、SSR/types/build、三浏览器与来源验证                                                                                                                           |
| F-007             | **已关闭（2026-10-20）**：生产 Next 示例区分无需/需要 `use client`，禁用 JS宿主、升级、事件、DOM identity 与 hydration 错误三浏览器通过                                                                                                               | `examples/next-boundary`、`pnpm check:next-boundary`                                                                                                                                                                                                                                             |
| F-011             | **发布链已完成，历史 native latest 清理仍阻塞**：Canary `0.1.1-canary.20261020.192.1.98809087` 发布、promote、Sigstore provenance、Node22/24 registry smoke、下游 dispatch 全通过；29 个 fixed 包 dist-tag 复核通过                                   | run `39376347136`；`Repair Native Latest` run `39382911550` 使用精确确认串触发但 npm DELETE 返回 E403，需具备 dist-tag 删除权限的维护者 token                                                                                                                                                    |
| D-003             | **已关闭（2026-10-20）**：可视面板与真实编译器 `dynamic-region` 追踪；三浏览器点击 DOM 显示 Binding/Effect/Signal                                                                                                                                     | `pnpm check:devtools-panel`、PR #134/#137                                                                                                                                                                                                                                                        |
| D-005             | **已关闭（2026-10-20）**：Quick Start 五片段全部映射到模板执行，四模板 typecheck/build/test，WC auto 与全部输出验证                                                                                                                                   | `pnpm check:quick-start`、CI 四模板 smoke、PR #138                                                                                                                                                                                                                                               |
| D-006             | 产品边界与上手文档已构建                                                                                                                                                                                                                              | “新用户15分钟”是需真实用户测试的目标，未取得计时记录                                                                                                                                                                                                                                             |
| D-007             | **已关闭（2026-10-20）**：真实 runtime 依赖 bundle 测量；五视图、复制、分享 URL/reload、键盘和失败路径三浏览器通过                                                                                                                                    | `pnpm playground:check`、`pnpm playground:smoke`                                                                                                                                                                                                                                                 |
| E-006             | **已关闭（2026-10-20）**：Rust SSR codegen/native 执行覆盖 defineElement、Host/Slot、DSD、definition option CSS 与首屏控件状态；runtime SSR 覆盖 Manifest 驱动的 shadow、defaults 和反射属性                                                          | `packages/core/compiler-native/__tests__/integration.test.cjs`、`packages/core/runtime-ssr/__tests__/runtime-ssr.spec.ts`、`packages/devtools/vite-plugin/__tests__/ssr-execution.spec.ts`；`styles`/`styleNonce` 是 definition options，不属于 Manifest；SSR 不模拟 `ElementInternals` 生命周期 |
| E-007             | **已关闭（2026-10-20）**：`hydrationPlan` 在 DOM/SSR 间共享稳定 Template/Node/Binding ID，SSR 自动写 marker；`hydratePlan` 逐 binding 重连并释放失败 setup；真实 Chromium/Firefox/WebKit 保持首屏、焦点、选区、DOM identity、events、props 和 cleanup | `transformModule()`、`hydratePlan()`、`pnpm check:hydration`；Streaming 按设计后置                                                                                                                                                                                                               |
| E-008             | **已关闭（2026-10-20）**：Admin 集成真实 Zeus UI Input/Dialog/DataGrid 与 Resource/Query，包含查询/筛选/分页/选择、编辑/保存及权限流程；生产产物三浏览器检查已接入 CI                                                                                 | `examples/admin`、`pnpm check:admin`；该结论只覆盖当前仓库示例及其 CI 验收，不代表 UI 包的 registry 发布或来源验证                                                                                                                                                                               |
| E-009             | 真实 registry tarball 的独立安装、来源/供应链读取和消费者矩阵已运行；结果记录在 `temp/golden-components/report.json`，但 React18/19 SSR import 与 Vue3 三浏览器具名 Slot 断言失败，故未完成                                                           | 修复并发布对应包后，重新运行 `pnpm check:golden-components`，要求所有 required assertions、版本、source commit 与 provenance 均通过                                                                                                                                                              |

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
