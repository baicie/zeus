# 路线图完成性审计（2026-10-19）

总目标仍进行中。审计基线为 Zeus `dc70175`、Zeus UI `3fc286e`；依据原始
`zeus-architecture-roadmap-2026-10-16/01-TASKS.md` 与 `02-DESIGN.md`，并保留
[执行表](./architecture-roadmap-2026-10.md) 中的原 Task ID。绿灯只证明其覆盖的范围。
Beta 无历史兼容层规则优先于原设计中的兼容窗口建议。

## 原始验收状态

| 项目              | 现有证据与明确缺口                                                                                                                                                                                                                                    | 后续证明要求                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| B-003 / M2 Golden | `tests/contracts/golden-components.json` 四个真实 UI 组件的 browserAcceptance / packedUiConsumers 仍 pending；packed matrix 使用 synthetic fixture                                                                                                    | 真正 Button/Input/Dialog/DataGrid tarball，eager/lazy 属性及生命周期对齐，三种消费者/三浏览器       |
| F-007             | **已关闭（2026-10-20）**：生产 Next 示例区分无需/需要 `use client`，禁用 JS宿主、升级、事件、DOM identity 与 hydration 错误三浏览器通过                                                                                                               | `examples/next-boundary`、`pnpm check:next-boundary`                                                |
| F-011             | 当前主干 CI/Docs/Native Matrix 通过；认证身份正确；native latest 删除 E403，Canary 被污染阻断                                                                                                                                                         | 当前源码 Canary 成功发布、签名来源/dist-tag校验、外部install smoke；失败不能宣称成功                |
| D-003             | consumer 可生成 component/owner/binding/source snapshots 和 MessagePort 数据                                                                                                                                                                          | 实际面板，浏览器点击 DOM 能展示对应 Binding/Signal；不能把 renderPanel 占位函数当面板               |
| D-005             | 一个 Quick Start 的四段配置比对加四模板 smoke                                                                                                                                                                                                         | 其余 Quick Start 与 API 文档示例原样执行，形成片段到命令的覆盖清单                                  |
| D-006             | 产品边界与上手文档已构建                                                                                                                                                                                                                              | “新用户15分钟”是需真实用户测试的目标，未取得计时记录                                                |
| D-007             | **已关闭（2026-10-20）**：真实 runtime 依赖 bundle 测量；五视图、复制、分享 URL/reload、键盘和失败路径三浏览器通过                                                                                                                                    | `pnpm playground:check`、`pnpm playground:smoke`                                                    |
| E-006             | `ssrCustomElement` 接收手写 SSRNode 并输出 DSD                                                                                                                                                                                                        | 按设计§10.2联动 SSR Codegen/Manifest，关键组件首屏与 CSS/Slot/Form/宿主属性/初始状态政策            |
| E-007             | **已关闭（2026-10-20）**：`hydrationPlan` 在 DOM/SSR 间共享稳定 Template/Node/Binding ID，SSR 自动写 marker；`hydratePlan` 逐 binding 重连并释放失败 setup；真实 Chromium/Firefox/WebKit 保持首屏、焦点、选区、DOM identity、events、props 和 cleanup | `transformModule()`、`hydratePlan()`、`pnpm check:hydration`；Streaming 按设计后置                  |
| E-008             | Admin 的路由、loader、权限和语义表单已通过生产产物三浏览器；尚未使用真实 UI 组件及 Resource/Query                                                                                                                                                     | 按设计§14.1集成真实 Zeus UI Input/Dialog/DataGrid、请求适配器及查询/筛选/编辑/分页/选择完整用户故事 |
| E-009             | 单一 TSX fixture 已通过本地隔离 `pnpm pack` 消费矩阵                                                                                                                                                                                                  | 按设计§14.2对真实 registry 发布 tarball 独立安装，完成同一故事验证与来源校验                        |

D-009 审计另复现了注释换行触发 ASI、编译指令变化、嵌套模板/JSX 被误判安全的缺陷。
已以 Babel parser 注释范围替代启发式扫描，87 项插件测试及独立审阅通过；解析失败仍重挂载。`$state` 实现不在
原任务要求内；原任务只要求 RFC，不为凑齐数量添加隐式语义。

## UI 仓库路线图的真实欠项

不仅检查 U 编号，还核对 UI 的 MVP、fix-mvp、advanced、examples 与 showcase roadmaps，
以及 Zeus Component Host Phase 10/11：

- CLI 没有 remove；doctor 仍读历史 components.lock，而 add/update 写 zeus-ui.lock；
  测试脚本有不存在的文件路径。这些属于当前实施切片。
- add 帮助声明的 `--all/--yes/--skip-deps` 解析器拒绝；路线图要求的 `--path/--registry`
  与 remote registry resolver/来源锁未实现。需要完整参数、依赖安装和失败/安全契约。
- CLI/锁仍有历史格式 fallback，应在独立完整迁移中收敛，符合 beta 规则。
- 公开 registry 只有 button/input（另有 cn/globals）；旧模板目录不被当前 loader 读取。
  Phase 10 承诺的 switch/checkbox/tabs/dialog/icon React/Vue 可安装入口尚缺。
  `check-component-coverage` 的两组件范围门禁不能证明完整交付，扩充时同步 gate、类型、
  文档、showcase 与依赖元数据。
- MVP Phase 11 的 form-field/popover/dropdown-menu/toast 及其 portal、dismissable-layer、
  定位/叠层/焦点依赖仍须完成；现有 beta 的后置说明不是总目标范围豁免。
- 文档版本说明、CLI维护旅程、旧 roadmap 状态须在实际实现和验证后同步。
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
