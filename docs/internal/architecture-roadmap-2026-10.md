# 架构路线图目标与执行记录（2026-10-16）

## 目标与依据

依据用户提供的 `zeus-architecture-roadmap-2026-10-16` 设计包推进 M0→M3，后续 M4/M5 按依赖完成。目标已经登记到当前 Codex chat；只有全部对应验收满足才报告完成。

- Zeus Native：外部项目使用标准 TSX、Signal、Vite 完成开发、类型检查、生产构建与交互。
- Zeus WebC：单份源码产出 WC/React/Vue，在独立安装的消费者中保持属性、事件、生命周期和方法契约。
- 复用 Rust 编译器及现有运行时；优先修复协议，不引入 VDOM 或组件重新执行模型。
- 附件属于设计提案。AGENTS.md 的 beta 规则优先：不实现 legacy/new 开关、历史 alias、弃用窗口或兼容转发包。
- M4/M5 的 DevTools、Router、Query、Hydration 不是首轮完成条件；不把首轮完成误报为整个路线图完成。

原始文件校验：

- `01-TASKS.md` SHA-256：`bac3e908363a46183cc086c0ee71499197af1287462b464139838ce4c86342cd`。
- `02-DESIGN.md` SHA-256：`feebc1df25d41442f5bb9a0bd54c60ed37f76d4ece5cea9a7483e30205a31e33`。

## 执行切片与验收

| 切片              | Task ID                 | 验收证据                                                                      | 依赖           |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------- | -------------- |
| 基线与复现        | B-001/B-002             | 两仓版本/依赖/导出/dist-tag/实测数据及可复跑脚本                              | 无             |
| 响应式唯一引擎    | R-001~R-004             | 真实 import 图、Scope/Batch/Diamond 测试、ADR、ESM/CJS 外部互操作             | 基线           |
| WC 属性协议       | W-002~W-005             | eager/lazy primitive、codec、identity、默认值阶段、升级重放、detach/reconnect | 基线           |
| 按组件注册与 SSR  | W-006/F-001/F-004       | Node 无 DOM SSR；同组件注册幂等、不同定义冲突；独立入口无全量 Manifest        | WC             |
| TSX 语义与 Spread | S-001~S-004/C-001/C-002 | 位置语义 RFC、IR/DOM/SSR/SourceMap、函数值不误执行、覆盖顺序                  | 响应式契约     |
| 嵌套 JSX 与控制流 | S-005/S-006/C-003       | 条件/逻辑/数组区域，DOM identity、分支清理和诊断                              | TSX IR         |
| 外部安装矩阵      | F-002/F-003/F-005/F-006 | tarball 安装后的 Native/React18/React19/Vue3 类型/构建/SSR/浏览器             | WC/Wrapper/TSX |

每片先复现，实施后运行相关测试；边界稳定后统一类型检查、lint、build、DTS、API snapshot、exports 与完整测试。验证必须说明是源码测试、产物测试还是外部安装；未执行的浏览器/发布不能以单元测试替代。

## 任务状态

“进行中”仅表示已经开展，完成必须有对应证据；其余任务保留原 Task ID，以便后续继续，不重复实现已存在能力。

当前汇总（2026-10-24）：D-006 已按用户真实上手反馈完成，F-011 发布链已完成、历史 native `latest` 删除按用户决定放弃。剩余完整目标是 Zeus UI `0.1.0` 稳定发布及发布后的 registry、provenance 和独立消费者验收。下方按日期保留的执行记录描述当时状态，不覆盖本汇总与任务表。

| Task  | 任务                                                                                                                                     | 状态                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B-001 | 建立 baseline 记录：两个仓库版本、commit、依赖、公开导出、最新 npm dist-tag、体积和构建时延                                              | 已完成；根构建一次实测 8,719 ms，原始日志已留存                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B-002 | 记录已知兼容性边界与风险：TSX Spread、Nested JSX、React SSR Import、Lazy 属性同步、注册副作用、CI 发布；标注已确认/待复现                | 已复现；风险逐项跟踪                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| B-003 | 选择 4 个 Golden Components：Button、Input、Dialog、Data Grid；冻结跨框架 API 预期                                                       | 已完成（UI beta.33 / Zeus beta.18 的 registry tarball、Native/React18/React19/Vue3 × Chromium/Firefox/WebKit 全矩阵、来源/供应链证据见 [Golden 验收报告](./golden-components-acceptance-2026-10-23/report.json)；Data Grid 基线 `u005-data-grid-2026-10-23` 基于发布源码 `74fe9ea33f7a51eb8551debe9992cebfc1a0ebe7` 生成，已由 UI PR [#112](https://github.com/baicie/zeus-ui/pull/112) 合并，merge commit `eb25d05bb8b249e708e9890f01af86f752674ed4`，CI 与本地合同检查通过） |
| B-004 | 明确 `0.1.x beta → 0.2.0` 稳定性规则和弃用窗口                                                                                           | 已完成（RFC-009；CI已有API Gate）                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R-001 | 检查 `alien-signals` 是否实际在 `@zeus-js/signal` 的运行时代码中被导入、参与依赖追踪；绘制 `createSignal → shallowRef → Dep → Effect` 链 | 已完成（审计脚本/ADR）                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R-002 | 针对目前自有 `Dep/Effect/Computed/Proxy`，运行嵌套 effect、批处理、computed diamond、递归更新、cleanup/dispose、跨 owner 测试            | 已完成（274项相关测试）                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| R-003 | 编写 ADR：保留自有引擎 vs 迁移 alien-signals；以功能契约、包大小、性能、Scope 兼容、许可/升级风险为依据                                  | 已完成（ADR-001）                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| R-004 | 修复或禁止同一树上不同响应式实现的跨包实例重复加载                                                                                       | 已完成（Node ESM/CJS、packed 物理副本与浏览器 bundle 边界均验证）                                                                                                                                                                                                                                                                                                                                                                                                              |
| R-005 | 明确 Primitive Signal 的浅响应式、对象代理、数组/Map/Set 的公开支持级别；区分稳定 API 和 internal                                        | 已完成（RFC-006 + public contract tests）                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R-006 | Effect Scope、cleanup、运行中 effect 重入与异步边界的错误语义文档化                                                                      | 已完成（RFC-006 + owner contract tests）                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S-001 | 正式确定 JSX 各位置的值语义：原生 attr/property、事件、ref、组件 prop、children、Slot、`Show/For`                                        | 已完成（RFC-008 对照矩阵与函数值/内置节点边界）                                                                                                                                                                                                                                                                                                                                                                                                                                |
| S-002 | 解决 Arrow Function 表示 getter 与函数值的歧义：旧行为兼容、推荐写法、新语义的切换方案                                                   | 已完成（函数 property/component/event/ref identity 与函数 child/builtin 诊断）                                                                                                                                                                                                                                                                                                                                                                                                 |
| S-003 | Native JSX Spread `div {...attrs}`：属性覆盖顺序、class/style merge、事件/ref、动态更新、对象 identity                                   | 已完成（DOM/SSR helper 18 项、native compiler 17 项通过）                                                                                                                                                                                                                                                                                                                                                                                                                      |
| S-004 | Component JSX Spread `<Child {...props} />`：getter 传播、覆盖优先级、children 与 key/ref，避免无谓 snapshot                             | 已完成（Native DOM 集成覆盖 reactive Spread 更新、显式属性/children/key/ref 覆盖、组件单次初始化）                                                                                                                                                                                                                                                                                                                                                                             |
| S-005 | 支持 JSX Expression 中嵌套 JSX（条件、逻辑、数组、函数返回 JSX）                                                                         | 已完成（Rust Lowering/DOM/SSR + Node 24.19 Native DOM/SSR 集成）                                                                                                                                                                                                                                                                                                                                                                                                               |
| S-006 | `Show/For` 语义检验：keyed 同 key 替换、排序、重复 key、index、焦点保持、cleanup 顺序                                                    | 已完成（controlFlow/cleanup 定向 63 项通过）                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S-007 | 固定函数型组件、WC 组件、普通 DOM 标签的分派边界；禁止错误识别为内建 `Show/For`                                                          | 已完成（按导入绑定 SymbolId 分派，支持别名并正确处理 lexical shadowing；`lower` 38/38、`transform` 39/39）                                                                                                                                                                                                                                                                                                                                                                     |
| S-008 | 完善 HTML/SVG/Custom Elements 类型；去除泛化 `[key: string]: unknown` 对原生标签的过宽兜底                                               | 已完成（独立 Zeus JSX namespace、HTML/SVG 映射、仅允许连字符 Custom Element fallback；JSX 类型矩阵通过）                                                                                                                                                                                                                                                                                                                                                                       |
| S-009 | `@once` 迁移方案：保留注释形式兼容，新增显式 `once(expr)` compile intrinsic（提案阶段）                                                  | 已完成（RFC-013 已 Accepted；Rust lower/transform/native contract 覆盖显式 intrinsic、shadowing、非法目标与旧注释迁移诊断；生成代码无 runtime once 包装）                                                                                                                                                                                                                                                                                                                      |
| S-010 | `$state/$derived` RFC：作用域捕获、赋值/++、解构、逃逸、嵌套对象、export、HMR/SSR                                                        | 已完成（RFC-012 已评审采纳语义边界，明确默认关闭、owner scope 与名称遮蔽诊断；语法转换须另提实现方案并通过契约矩阵，本任务不要求实现）                                                                                                                                                                                                                                                                                                                                         |
| C-001 | 扩充语义 IR：NativeSpread/ComponentSpread/ConditionalChild/ArrayChild/函数值语义标记，携带稳定 Span                                      | 已完成（IR round-trip、span 与 transform 测试通过）                                                                                                                                                                                                                                                                                                                                                                                                                            |
| C-002 | 实现 Rust Lowering/Codegen 对新 JSX 语法的支持；输出正确动态 DOM 区域和子 Scope                                                          | 已完成（条件/逻辑/map/数组、DOM/SSR codegen 与 Node 24.19 集成通过）                                                                                                                                                                                                                                                                                                                                                                                                           |
| C-003 | 对未知 JSX 表达式仍不能支持的情况给出准确诊断和修复提示；禁止静默字符串化                                                                | 已完成（嵌套调用、条件 operand、map operand/参数/额外 JSX 实参、数组 spread、raw-text 边界及 Show/For 未知/重复属性均有稳定诊断与 span；DOM/SSR 非法 child 有运行时错误）                                                                                                                                                                                                                                                                                                      |
| C-004 | Source Map 覆盖 Spread、Nested JSX、动态属性与高阶回调                                                                                   | 已完成（Rust DOM/SSR 与 Vite dev/production maps 覆盖 Spread、Nested JSX、动态属性和 map callback；source-map/transform 定向 41 项通过）                                                                                                                                                                                                                                                                                                                                       |
| C-005 | 代码生成优化：静态模板复用、冗余 DOM 写入消除、effect 数量、事件委托                                                                     | 已完成（runtime-dom 空 style 绑定跳过重复 removeAttribute；外部 mutation 修复保留；compiler optimization budget 固化静态模板/effect/事件委托门禁；定向 303 项与全量 CI 通过）                                                                                                                                                                                                                                                                                                  |
| C-006 | Vite Plugin HMR 分类：纯样式、模板结构、Signal 初始化、组件 API 变更；先保障销毁重挂正确，再做状态保留                                   | 已完成（stylesheet 走 Vite CSS HMR；TSX 分类诊断；Rust HMR 在初始化前注册 disposer、逆序逐项清理并支持异常模块；Vite 插件 39 项、Rust transform 41 项通过；状态保留留给 D-009）                                                                                                                                                                                                                                                                                                |
| W-001 | 建立 `RFC-WC-ABI-V1`：属性/Property/Event/Slot/Method/Style/Form/生命周期/注册规范                                                       | 已完成（RFC-010；运行时与发布矩阵按 W-007~W-013/F-006 验收）                                                                                                                                                                                                                                                                                                                                                                                                                   |
| W-002 | 复现并修正 Lazy attribute 二次强制转换问题（`web-c-runtime/props.ts` → `mountElementDefinition`），统一一次性规范化                      | 已完成（一次规范化回归）                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| W-003 | 实现 Lazy `default` 的前置可观察策略：静态默认值 Manifest + 工厂默认值的明确初始化/ready 协议                                            | 已完成（静态/工厂默认值）                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| W-004 | 明确 Property 先于/后于 attribute 写入的覆盖策略与反射循环保护；支持 pre-upgrade own-property replay                                     | 已完成（升级/反射identity）                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| W-005 | Eager/Lazy 相同的 `connected → disconnected → reconnected` 生命周期、dispose、async race；对 DOM move 做区分                             | 已完成（packed Chromium/Firefox/WebKit × Native/React18/React19/Vue3，lazy/eager detach-reconnect 与 listener cleanup）                                                                                                                                                                                                                                                                                                                                                        |
| W-006 | `defineCustomElement(tag)` 显式单组件注册；同名不同构造器/版本冲突抛可诊断错误，不以静默忽略掩盖                                         | 已完成（实现、Rollup 与 packed 单组件注册验证）                                                                                                                                                                                                                                                                                                                                                                                                                                |
| W-007 | 规范 Methods 的 `ready` 语义：同步方法/async 代理、调用在未 ready 时的行为；方法抛错和销毁后行为                                         | 已完成（lazy async proxy、reject/error/detach 回归与 packed 三引擎验证）                                                                                                                                                                                                                                                                                                                                                                                                       |
| W-008 | 规范 `CustomEvent` 命名、`detail`、`bubbles/composed/cancelable` 默认值和 React/Vue 映射                                                 | 已完成（运行时/Manifest、React/Vue consumer 与 packed 三引擎验证）                                                                                                                                                                                                                                                                                                                                                                                                             |
| W-009 | 将 Light DOM Projection 与原生 Shadow Slot 作为两种独立策略；文档说明 MutationObserver、节点所有权边界                                   | 已完成（packed Chromium/Firefox/WebKit × Native/React18/React19/Vue3 覆盖默认/具名/fallback、增删、改名、detach/reconnect、nested/reorder/focus/selection；21 项 runtime-dom 回归）                                                                                                                                                                                                                                                                                            |
| W-010 | Form-associated 规范：ElementInternals、disabled/reset/restore、默认/当前 value                                                          | 已完成（packed Chromium/Firefox/WebKit × Native/React18/React19/Vue3 真实验收 validity、fieldset disabled、reset/restore、default/current value；ElementInternals 缺失 fallback 65 项回归）                                                                                                                                                                                                                                                                                    |
| W-011 | 统一样式能力：Design Tokens、CSS Parts、`::part`、`data-*` Host、Shadow/Light CSS 注入                                                   | 已完成（Zeus PR #117 packed 验收覆盖 Shadow/Light DOM 主题切换、CSS Parts/Vars Manifest、Host data attributes 与 CSP nonce；CI 全绿）                                                                                                                                                                                                                                                                                                                                          |
| W-012 | 明确 WC 的受控/非受控组件行为，Button/Input/DataGrid 分别具备契约例子                                                                    | 已完成（Input runtime 5 项、DataGrid controlled model 与运行时/e2e 261 项通过；文档冻结外部状态所有权及 sortColumn="" 受控清空 sentinel）                                                                                                                                                                                                                                                                                                                                      |
| W-013 | Manifest v1：组件 ABI Schema 带 `schemaVersion`、默认值策略、属性/事件/Slot/方法/Style 信息                                              | 已完成（schemaVersion 唯一版本字段；defaults/props/events/slots/methods/CSS 元数据单一模型，构建期拒绝无效或不可序列化数据）                                                                                                                                                                                                                                                                                                                                                   |
| F-001 | React Wrapper server-safe import：禁用模块初始化时对 `HTMLElement/customElements/document` 的非守卫访问                                  | 已完成（Node 与 packed SSR import 通过）                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| F-002 | 定义 React 18/19 适配：类型化 Props、事件 `onXxx`、DOM Property、Ref、`className/style` 和儿童内容                                       | 已完成（React18/19 packed types/build/browser 通过）                                                                                                                                                                                                                                                                                                                                                                                                                           |
| F-003 | Vue 3 适配：`props/attrs/emits`、Property 写入、Slot、`v-model` 事件 Detail 解包                                                         | 已完成（Vue3 packed types/build/browser 通过）                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| F-004 | `minimal/runtime/event-bridge` 注册策略统一为按组件注册；Manifest 不能被不相关组件意外拖入首包                                           | 已完成（Node24 Chromium packed 已验证单组件不注册无关 tag；后续事件断言归 F-006）                                                                                                                                                                                                                                                                                                                                                                                              |
| F-005 | 确保 `package.json` subpath exports、`sideEffects`、peerDependencies、类型指向、CSS import 正确                                          | 已完成（exports/CJS 检查、DTS 与独立 packed 安装通过）                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F-006 | 建立真实 Browser Matrix：Chromium/Firefox/WebKit × Native/React18/React19/Vue3                                                           | 已完成（Node 24.19 packed：三引擎 × 四消费模式，含 Methods/Form/focus，30 项检查全通过）                                                                                                                                                                                                                                                                                                                                                                                       |
| F-007 | Document/SSR tag 输出策略：SSR-0 能输出宿主 tag 和可串行化原始属性，客户端升级无致命 mismatch                                            | 已完成（React/Vue wrapper SSR回归；`examples/next-boundary`用公共插件生成产物并分别展示无需/需要`use client`场景，生产Next服务、禁用JS宿主、升级/事件/DOM identity/hydration错误三浏览器通过）                                                                                                                                                                                                                                                                                 |
| F-008 | Typed Event、Named Slot 类型、Custom Element Manifest、React/Vue DTS 共用 Analyzer 数据源                                                | 已完成（Analyzer 产物驱动 Custom Elements、React/Vue DTS；生成消费者类型检查覆盖事件 detail/name、props 与 named slots）                                                                                                                                                                                                                                                                                                                                                       |
| F-009 | React/Vue 交互插槽能力边界：普通 Slot 默认支持；复杂 framework VNode/Portal 不直接跨 WC Runtime；Renderer Adapter RFC                    | 已完成（RFC-011、framework-neutral keyed adapter、React 18.3.1/19、Vue 3、Portal/Teleport mount/update/dispose/reconnect 与外部 target 保留回归；Chromium/Firefox/WebKit 三浏览器通过；Zeus UI PR #106 已合并，公开 `cellRenderer` ABI 仍明确未冻结）                                                                                                                                                                                                                          |
| F-010 | 组件级 Chunk、动态 Import、CSS 体积与加载成本建立预算                                                                                    | 已完成（CSS 2.03 KB / 624 B gzip / 520 B brotli；首次交互 74.3 ms；CI trend JSON/CSV，artifact 保留 90 天）                                                                                                                                                                                                                                                                                                                                                                    |
| F-011 | 生产发布链加上 npm token/provenance/2FA 预校验、dry-run、dist-tag/published verification                                                 | 已完成并按用户决定放弃历史 native `latest` 清理（发布链的 Canary、provenance、registry smoke 和下游 dispatch 均通过；历史 tag 删除此前返回 npm E403，用户确认不再处理，后续 0.2.0 不再以此为阻塞）                                                                                                                                                                                                                                                                             |
| U-001 | 为 Zeus UI 基础组件定义质量等级（experimental/beta/stable），按行为、a11y、E2E 测试而非数量评级                                          | 已完成（Zeus UI PR #94；20 个基础组件质量清单、行为/a11y/E2E 证据路径、阈值校验与 release artifact gate 通过）                                                                                                                                                                                                                                                                                                                                                                 |
| U-002 | Schema/Manifest 驱动 React/Vue Registry：减少 Variant/Size/Events/Slot 定义重复；CSS 可保留有意义差异                                    | 已完成（Zeus UI PR #96；schema 校验、React/Vue 生成契约、API 表与全套 UI CI 通过）                                                                                                                                                                                                                                                                                                                                                                                             |
| U-003 | Data Grid 拆出 Headless Model、Viewport Controller、Render Scheduler、Renderer、WC Host                                                  | 已完成（Zeus UI PR #104；Renderer 容器泛型化为 DOM-free contract，Host adapter 统一 viewport/scheduler/renderer connect/disconnect，reconnect-safe clear 与永久 dispose；类型、构建、exports、lint、175 项 unit 与远程 CI 通过）                                                                                                                                                                                                                                               |
| U-004 | Virtualizer 与 VirtualList Renderer 分离：提供 `range → 可见节点挂载` 的完整契约，不假设 `<Slot />` 自动虚拟化                           | 已完成（Zeus UI PR #95；keyed renderer、100k 数据验收、Slot 投影文档与 CI 通过）                                                                                                                                                                                                                                                                                                                                                                                               |
| U-005 | Data Grid 建立基准：10k×20、100k×20、100k×100；记录内存、DOM 总量、滚动帧、更新耗时和可见单元格数量                                      | 已完成（Zeus UI PR #97；版本化 baseline manifest、结构预算检查、JSONL 报告与 CI artifact；全套 UI CI 通过）                                                                                                                                                                                                                                                                                                                                                                    |
| U-006 | Data Grid React/Vue 可扩展 cell renderer PoC：框架节点由 Adapter 管理，Grid Model 保持独立                                               | 已完成 PoC（Zeus UI PR #101 已 squash 合并为 `15340d4`；framework-neutral adapter 覆盖 rowKey/columnId 复用、renderer/host 替换、mount/update/dispose 异常清理、重复 host 拒绝、host 交换与断连释放；React/Vue 真实消费者接入仍属于后续 F-009 验收）                                                                                                                                                                                                                           |
| U-007 | 组件 accessibility gate：表单组件、Dialog、Tabs、Select、Grid 的键盘/焦点/ARIA 验证                                                      | 已完成（Zeus UI PR #103；axe-core 覆盖 input、checkbox、switch、textarea、radio-group、dialog、tabs、select、data-grid 九条真实路径，键盘/焦点 4 条路径通过，CI 证据已归档）                                                                                                                                                                                                                                                                                                   |
| D-001 | `create-zeus` 新增“Application”与“Component Library”模板，保持现有 Basic/WC 模板                                                         | 已完成（PR #101；四模板类型检查、构建与 smoke 验证通过）                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D-002 | 修复 CLI 覆盖目录安全：默认不允许删除非空目录；显式 `--force` 需强提示且拒绝危险路径                                                     | 已完成（PR #108；默认拒绝非空目录、危险路径和链接；`--force` 双重确认；27 项定向测试与四模板 smoke 通过）                                                                                                                                                                                                                                                                                                                                                                      |
| D-003 | DevTools MVP：组件树、Owner 树、Signal/Effect、DOM Binding、Cleanup、耗时                                                                | 已完成（可视面板、Owner/Component/DOM Binding/Effect/Signal、cleanup与耗时；编译器动态区域接入稳定binding instrumentation；真实 dev runtime 三浏览器点击DOM后显示Binding/Effect/Signal，PR #134/#137通过）                                                                                                                                                                                                                                                                     |
| D-004 | 使用 `custom-elements.json` 生成 VS Code HTML Custom Data，不先做独立 LSP                                                                | 已完成（PR #102；CEM 标签/属性/字面量生成、非法输入诊断与 43 项定向测试通过）                                                                                                                                                                                                                                                                                                                                                                                                  |
| D-005 | 文档清理：移除旧 Babel Runtime 叙述、修复错误 quick-start、对齐真实 `vite-plugin` 与 `web-c` 入口                                        | 已完成（Quick Start五个片段全部由CI原样比对/执行；四模板typecheck/build/test；WC auto、WC/React/Vue、Manifest与Custom Elements产物均验证；入口叙述和旧Babel描述已清理，PR #138）                                                                                                                                                                                                                                                                                               |
| D-006 | 文档站统一基础概念：Zeus Native vs WebC vs React/Vue Consumer；加入“何时不推荐使用 Zeus”                                                 | 已完成（Native/WebC/Consumer产品边界文档已交付；用户实际上手并确认约 10 分钟完成，HTML 预览为主要卡点；过程有修复与指导，未记录逐步精确计时）                                                                                                                                                                                                                                                                                                                                  |
| D-007 | 集成 Playground：浏览 TSX → 查看编译后 DOM/SSR JS 与 IR、错误、打包体积                                                                  | 已完成（静态示例含DOM/SSR/IR/诊断；Rolldown生产bundle记录传递runtime依赖、模块清单及raw/gzip/brotli；三浏览器验证五视图、真实剪贴板、分享URL/reload、键盘、加载/重试/拒绝剪贴板）                                                                                                                                                                                                                                                                                              |
| D-008 | Testing Utils：render、fireEvent、flushEffects、dispose、queryByRole 等组合封装                                                          | 已完成（`@zeus-js/testing` 公共包、JSDOM 单元测试与 API 文档；不依赖 private runtime）                                                                                                                                                                                                                                                                                                                                                                                         |
| D-009 | HMR 状态保留：只针对证明安全的编辑类型启用；不安全场景完整 remount                                                                       | 已完成（RFC-017 冻结安全矩阵；仅可证明无可执行变化的 `comment-only` 返回空模块列表保留 root/owner/DOM identity，其余 TSX/Signal/API/未知变化完整 dispose-remount，Vite插件5文件87项及独立审阅通过）                                                                                                                                                                                                                                                                            |
| E-001 | Router RFC/Adapter：路由匹配、嵌套路由、history、参数、错误边界、预加载；优先适配已有库，必要时自建轻量核心                              | 已完成（PR #106 Adapter + examples/admin 真实导航验收；生产产物 Chromium/Firefox/WebKit 覆盖嵌套匹配、参数、history、预加载、深链接刷新、403/404/500 与 layout identity）                                                                                                                                                                                                                                                                                                      |
| E-002 | Resource/Query RFC：signal-accessor、pending/error/success、request cancellation、stale/caching 语义                                     | 已完成（PR #106；owner-aware resource、取消/缓存语义与 RFC-015，定向测试通过）                                                                                                                                                                                                                                                                                                                                                                                                 |
| E-003 | Query Core Adapter PoC：接 `@tanstack/query-core` 等通用库，避免重写全缓存系统                                                           | 已完成（PR #106；query/infinite query/mutation adapters，取消与重试复用测试通过）                                                                                                                                                                                                                                                                                                                                                                                              |
| E-004 | ErrorBoundary / Portal / Transition 契约                                                                                                 | 已完成（Native Portal、显式 factory ErrorBoundary、Resource 集成、Transition runtime 状态机与 compiler intrinsic lowering 已通过 Rust lower/transform、Native Vite/JSDOM 和 runtime 定向回归；浏览器动画时序仍由显式 hook/duration 契约覆盖）                                                                                                                                                                                                                                  |
| E-005 | SSR-0：模块安全导入 + 标记/基础属性 SSR；定义 no-hydration 的真实限制                                                                    | 已完成（RFC-004、Node 无 DOM 安全导入、基础属性序列化、SSR-0 测试及 no-hydration 限制文档已通过）                                                                                                                                                                                                                                                                                                                                                                              |
| E-006 | SSR-1：Web Component 内部 SSR、Declarative Shadow DOM 适配与属性一致性                                                                   | 已完成（Rust SSR codegen/native 执行覆盖 defineElement、Host/Slot、DSD、CSS 与初始表单控件值；runtime SSR 测试覆盖 Manifest 驱动的 shadow/默认值/反射属性。`styles`/`styleNonce` 属于 definition options，不进入 Manifest；SSR 不执行 ElementInternals 表单生命周期）                                                                                                                                                                                                          |
| E-007 | SSR-2：Hydration marker、DOM 复用、事件绑定、props reconciliation；再研究 Streaming                                                      | 已完成（DOM/SSR 共享稳定 Template/Node/Binding ID 与 `hydrationPlan`；SSR 自动输出匹配 marker，`hydratePlan` 要求逐 binding 重连并报告缺失 handler；DOM/SSR plan 一致性、47 项 Rust transform、20 项 native integration 与三浏览器焦点/选区/DOM identity/events/cleanup 均通过；Streaming 仍按设计后置）                                                                                                                                                                       |
| E-008 | Zeus Admin 标杆应用：路由、请求、表单、Dialog、Grid、权限等完整场景                                                                      | 已完成（`examples/admin` 集成真实 Zeus UI Input/Dialog/DataGrid 与 Resource/Query，覆盖查询/筛选/分页/选择、编辑/保存、权限、错误和路由；生产产物 Chromium/Firefox/WebKit 验收由 `pnpm check:admin` 执行）                                                                                                                                                                                                                                                                     |
| E-009 | Zeus Web UI 标杆项目：同一组件源码、三种消费工程与发布产物                                                                               | 已完成（UI beta.33 对应 Native/React18/React19/Vue3 独立消费工程的 Node SSR import、类型、构建、三浏览器行为、source/Manifest hash、SLSA provenance 与 tarball integrity 全部通过；证据见 [Golden 验收报告](./golden-components-acceptance-2026-10-23/report.json)）                                                                                                                                                                                                           |

## 当前边界

- 公开 npm 版本必须查询 registry；当前 Golden 合同固定 UI beta.33 / Zeus beta.18，并由持久报告记录精确 source commit 与实际 registry tarball 证据。
- Zeus UI beta.33 声明并使用 Zeus beta.18；外部消费验证需显式记录 registry 版本，不以本地产物替代。
- register:"side-effect" 是明确的浏览器副作用输出目标；Lazy Wrapper 的 Node 导入与服务端渲染路径需安全，不能 mock HTMLElement 掩盖错误。
- 物理重复安装的响应式包与 Node import/require 混用是不同风险，分别验收。

## 验证与交付记录

实施过程中持续更新此处，不以附件中的静态审查结论替代实际运行。

### 首轮实施与审查进展（2026-10-17）

- 基线、Golden 四组件契约、ADR-001 与 RFC-007 已落盘；RFC-009 根据项目 Beta 规则明确无弃用窗口。
- WC eager/lazy 契约相关目录首次完整运行 416 项测试通过，后补 1 项升级反射 identity 回归通过；后续 W-005/W-010 的真实生命周期、表单、焦点与 Grid packed 矩阵已补齐。
- React/Vue 两包 10 文件 47 项源码测试通过；后续 F-006 已用本地产物独立安装完成 Native/React18/React19/Vue3 × Chromium/Firefox/WebKit 的 types、build、SSR 与浏览器消费回归。
- 注册独立审查用真实 Rollup 验证多组件、嵌套相对路径、单组件与全量入口组合、多 registry、无导入副作用和 tree shaking，通过。eager side-effect 输出仍是浏览器目标。
- R-005/R-006 已由 RFC-006 固定 Primitive、Proxy/collection 的 internal 边界，以及 owner、cleanup、重入和异步恢复语义；对应 contract/owner 测试覆盖公共与内部边界。
- TSX/spread 独立审查复现 SSR 属性名注入、attr/property 覆盖顺序差异及 ref 同步销毁后监听器泄漏，正在修复并加回归；不把已有测试全绿当作此片验收。
- 删除未编译 JSX 的运行时解释 fallback；工具链调用改为明确错误 `ZEUS_JSX_COMPILATION_REQUIRED`，主入口移除 JSX helper 导出。相关 7 项测试通过。
- 当前 `pnpm check`、`pnpm lint`、生产构建和 DTS 构建均已通过；Chromium/Firefox/WebKit packed 消费者本地三引擎矩阵也已完成，CI job 仍作为持续回归入口。
- W-001 文档验收：`docs/rfcs/RFC-010-wc-abi-v1.md` 冻结可序列化 ABI schema、属性/事件/Slot/方法/样式/表单/生命周期规则、非法状态错误码、单一数据源边界和 Button 示例；后续 W-013 将该 schema 落入唯一的 `ComponentManifest` v1。
- W-013/F-008 Manifest 与类型输出：Analyzer 固定 `schemaVersion: 1`，合并静态/工厂默认策略、runtime/public props、typed events、named slots、methods 和 CSS parts/variables；`zeus.components.json` 与 `custom-elements.json` 在输出期验证结构及 JSON 可序列化性，标准 Custom Elements Manifest 输出方法参数/返回类型。React/Vue DTS 从相同 Analyzer Manifest 生成，TypeScript consumer regression 检查错误 prop、event name/detail 与未声明 slot。验证：Analyzer、component-dts、output-wc 16 个 Vitest 文件/210 项通过；`pnpm check` 和目标文件 Prettier 检查通过。lazy styles/styleNonce 保留在组件 definition options，由 `mountElementDefinition` 在模块加载后处理，不复制到 loader ABI。
- C-004 source map：Rust DOM/SSR 映射回归覆盖 Spread、嵌套组件 JSX、动态 attribute/property 与 map callback；插件直转、SSR、Vite dev 和 production build 逐点验证映射。Rust transform 41 项、Vite source-map/transform 41 项通过。
- W-012 controlled state：Zeus UI Input 受控时只报告 `value-change`，父级不写回则 DOM 恢复外部值；非受控值只从初始 default 取值。DataGrid 受控选择、排序、active cell 交互只发送 proposal，不回写内部模型到 props；排序继续受控但清空时使用 `sortColumn=""`，`undefined` 表示退出受控。Zeus UI DataGrid unit 148 项、e2e 113 项、Input runtime 5 项通过。
- W-011 browser style 验收：packed consumer 新增 Shadow DOM token 主题切换、`::part(control)` 外部样式与 style nonce 检查。Chromium 还暴露 slot 改名后跨连接状态移动节点会触发 `HierarchyRequestError`；`moveBefore()` 现在只用于 parent 与 node 连接状态相同的移动，其余使用 `insertBefore()`。Node 24.19 本地产物独立安装矩阵 Native/React18/React19/Vue3 × Chromium/Firefox/WebKit 全部通过；`temp/packed-consumers/report.json` 记录 30 项全通过。
- W-007 lazy methods：Promise proxy 改为从 mount state 的 exposed-method map 取实现，避免 `defineElement.expose()` 的 host own-property 绕过代理；初始化前断开时 `componentOnReady` 和 queued method 使用 `ZEUS_WC_DISCONNECTED_BEFORE_READY` reject，重连复用 module Promise 后重新挂载。验证为 `bootstrapLazy.spec.ts`、generated lazy entry/runtime-dom 定向测试及 packed 三引擎消费者。
- W-008 CustomEvent：确定默认 DOM 名称由事件 key 转 kebab-case，`detail` 原样传递，`bubbles/composed/cancelable` 默认 `true/true/false`；事件声明选项可覆盖默认值，单次 `emit` 选项优先级最高。Analyzer Manifest 固化事件名称、React prop 和传播 flags；React runtime/event-bridge 与 Vue 映射将原始 CustomEvent 传给普通事件回调，Vue model 依据 `eventPath` 单独提取值。React 19 minimal 的真实消费者回归曾复现 `onValueChange` 未响应 `value-change`，现映射为 `onvalue-change`。证据：源码与 React/Vue generated-consumer 定向测试 94 项通过，packed 三引擎消费者也通过；ShadowRoot composed 传播由 runtime-dom 定向测试覆盖。
- F-004 按组件 lazy import 隔离：lazy entry 使用带 export 名的 source query，Rollup 为各组件建立独立模块变体，编译器只把该 lazy 变体中的顶层 `defineElement` 标为 pure。Node 24.19 packed Chromium 已通过“single wrapper registered unrelated tag”断言；新产物 `z-packed-button.entry.js` 仅保留 Button 定义。首次运行暴露的 composed event 失败随后按 F-006 修复，最新 Chromium 四模式矩阵全通过。相关定向 Vitest 3 个文件 49 项通过，`pnpm check` 通过。
- F-006 浏览器证据：Node 24.19 packed consumer 的 Native、React18、React19、Vue3 四模式，在 Chromium、Firefox、WebKit 均通过 install、Node SSR import、types、production build 和核心 browser 行为。首次 Chromium 运行暴露 runtime-dom 委托事件只沿 `parentNode` 穿过 ShadowRoot；现优先遍历 `event.composedPath()`，并为 closed ShadowRoot 内绑定增加 direct listener 与 owner cleanup。`packages/core/runtime-dom/__tests__/events.spec.ts` 的 10 项通过，覆盖 composed/non-composed open root 与 closed root cleanup；packed fixture 进一步覆盖 Methods、Form、focus、reset/restore 和 detached method reject，30 项检查全部通过。
- S-005/C-001/C-002/C-003 Native compiler slice：Rust IR 增加 `DynamicRegion` 的条件、逻辑、`.map()` 与数组字面量分支；DOM 输出使用 `mountDynamic` 局部替换子树，SSR 输出保留节点数组结构。普通 `{render()}` 仍作为动态节点值处理；无法 lower 的 `foo(<A />)`、条件/逻辑或 map operand 中的 JSX、非法 map 回调参数、raw-text 动态区域、JSX 数组 spread 均产生带 span 的稳定诊断。DynamicRegion 子树参与 delegated event 收集与 user locator 冲突扫描，Show fallback 也参与 locator 收集。`cargo test -p zeus_compiler --lib --tests` 通过（1 unit、7 IR、34 lower、39 transform）；native binding 已重建，Node 24.19 `packages/core/compiler-native/__tests__/integration.test.cjs` 12 项 DOM/SSR 集成全部通过。
- R-004 外部互操作：`pnpm check:runtime-interop` 与 `packages/core/signal/scripts/check-packed-interop.mjs` 在 Node 24.19 通过；覆盖 ESM/CJS 混用、生产/开发入口、同一安装树去重、两份物理副本的明确跨引擎错误、浏览器 bundle 边界及失败后上下文恢复。
- F-006 packed consumer matrix：`temp/packed-consumers/report.json` 记录 Node 24.19、Native/React18/React19/Vue3 × Chromium/Firefox/WebKit 的 install、SSR、types、build、browser 检查共 30 项全部通过；浏览器 fixture 还覆盖 Methods、Form、focus、reset/restore 和 detached method reject。该证据基于本地产物的独立安装，不代表 npm registry 版本。
- S-004 Component Spread：新增 Native compiler DOM 集成覆盖动态 Spread getter 将未覆盖字段更新到子组件绑定，显式 `className/title/key/ref/JSX children` 覆盖 Spread 值，并确认子组件只初始化一次、DOM identity 保持。验证：Node 24 `pnpm --filter @zeus-js/compiler-native test:native` 18 项通过；本轮同批 Rust Lowering/IR/transform 82 项、runtime-dom/runtime-ssr 控制流/Slot/Spread/insert 定向 126 项通过。SSR Component Spread 仍由既有 native SSR 集成覆盖。
- C-003 builtin diagnostics：补充 `Show`/`For` 编译期属性白名单；未知属性（包括 JSX 值）现在返回 `ZEUS_INVALID_BUILTIN_USAGE` 和非空源码 span，不再静默丢弃。验证：`cargo test -p zeus_compiler --test lower` 37 项通过，`cargo fmt --check --package zeus_compiler` 通过；重建 native binding 后 `test:native` 18 项通过。
- C-003 value boundaries：补充 `Array.map` 额外 JSX 实参诊断、内建属性重复诊断；DOM `bindText`/dynamic range 及 SSR 边界拒绝 Promise、Symbol 和非 Node 对象，动态区域先整体校验再替换。验证：Rust lower 37 项、runtime-dom/runtime-ssr 定向 95 项、`pnpm check` 通过；native binding 重建后 `test:native` 18 项通过。
- W-005/W-009 browser lifecycle/projection：packed consumer 真实 Chromium/Firefox/WebKit × Native/React18/React19/Vue3 通过；新增 Light DOM `shadow:false` 默认/具名 slot、fallback、动态增删/改名、nested/reorder、focused input selection、detach/reconnect observer，及 eager/lazy disconnect/reconnect、listener cleanup。`temp/packed-consumers-w010k/report.json` 与 `temp/packed-consumers-w010-full/report.json` 记录本地产物独立安装矩阵。
- W-010 form contract：packed consumer 真实 Chromium/Firefox/WebKit × Native/React18/React19/Vue3 通过 validity、fieldset disabled/re-enable、reset/restore、default/current value；`defineElement` 与 eager/lazy adapter 在缺失 `ElementInternals` 时仍挂载，3 个测试文件 65 项 fallback 回归通过。验证报告：`temp/packed-consumers-w010k/report.json`、`temp/packed-consumers-w010-full/report.json`。
- W-011 style slice：`defineElement` 增加 `styleNonce`，注入到 Shadow/Light 样式节点；owner dispose 移除样式，真实重连重新注入，避免重复 CSS。`defineElement.spec.tsx` 新增 nonce 与 disconnect/reconnect 回归；PR #117 的 packed consumers、style contract tests 与 Zeus CI 已补齐 Design Tokens、CSS Parts、Host data attributes 和 Shadow/Light 主题切换契约。
- F-007 Vue/React wrapper SSR tag 策略：Vue 生成器与 runtime `defineContainer` 共享 `string | false` 属性元数据，并额外传递 boolean 属性名以省略 false；SSR 只输出 custom element 宿主及安全原始属性，属性 alias 按 manifest 保留，复杂/unknown/property-only 值不进入 HTML。三种 Vue wrapper 模式与 React SSR 对照覆盖零注册、boolean/alias、复杂属性 identity；文档明确无 hydration，浏览器重新挂载并升级 custom element。
- 最终回归：Node 22.12（仓库 engine warning 仅提示需 `^22.18.0 || >=24.11.0`）下完整 unit suite 128 files / 1329 tests 通过；`pnpm check`、Rust formatter、Prettier 目标文件和 `git diff --check` 通过。Native binding 使用 Node 24 重建后 contract/integration 19 项通过。
- F-010 Component Host budget：`component-host` fixture 通过真实 `@zeus-js/output-css` 产出 CSS，并保留 WC/React/Vue 的组件级动态 chunk；CI 对 PR 和 `main` push 安装 Puppeteer Chrome，强制校验 runtime 报告非空，按 ref 串行恢复最近一次 `main` benchmark artifact，生成 job summary 并上传 report/trend artifact。Node 24.19 本地 `pnpm bench:component-host:ci` 通过，报告含 15 个 runtime 指标；计时从冷页首次脚本执行开始，覆盖 CSS 下载、lazy entry 导入/注册、组件 chunk 加载、ready 和首次受信任点击，`wc.firstInteraction.z-bench-button` 为 74.3 ms（预算 500 ms），CSS 为 raw 2,037 B、gzip 624 B、brotli 520 B。
- F-010 verification：`pnpm check`、`pnpm lint`、benchmark Vitest 13 项、`pnpm format-check`、`git diff --check`、`pnpm size:ci` 与 `pnpm --filter @zeus-bench/component-host check` 均通过；全局 runtime-dom/zeus 包体门禁按当前 main 实测基线更新为 50/39 KB，并保留约 4% 余量。
- D-008 Testing Utils：新增 `@zeus-js/testing`，通过 `@zeus-js/zeus` 公共入口提供 `render`、`dispose`/`unmount`、`rerender`、`fireEvent`、`flushEffects` 与 `queryByRole`；JSDOM 定向测试 5 项通过，覆盖渲染生命周期、事件初始化、隐式/显式 role 和 accessible name。包已加入 DTS 构建、CommonJS 契约与 API 文档，未引入 runtime-dom 或 signal private subpath。
- D-009 HMR preservation：RFC-017 冻结 `comment-only` 唯一保留路径；Vite 插件返回空模块列表以跳过失效和 root remount，字符串、正则、JSX 文本/结构以及其他可执行变化完整 dispose-remount。Vite插件5文件87项及独立审阅通过；绑定更新和 stateful module swap 明确不在当前契约内。
- E-004：`Portal`、显式 factory `ErrorBoundary`、Resource 错误转发和 scope cleanup 已通过定向回归；Transition 由 runtime-dom helper 提供 enter/leave class、duration、取消和 cleanup 语义，Rust compiler 已识别仅来自 Zeus runtime 的 `Transition` intrinsic，生成 `mountTransition`，SSR 输出初始条件分支并保留未知/影子同名组件边界。Rust compiler 1+7+43+1+46、Native integration 14、compiler-shared boundary 9 与 runtime Transition 定向测试通过。
- F-011 npm auth：`verify-npm-auth` 在核验已发布固定包 read-write 权限前读取 `npm profile get tfa`，对首次发布的 404 包记录为待 publish 验证；5 项定向测试通过。真实 registry beta 发布、Sigstore provenance 和 native `latest` dist-tag 修复仍受 Release 环境与维护者授权约束。
- W-011 completion record：PR #117 的 packed consumers 验证 Shadow/Light DOM 主题切换、CSS Parts/Vars Manifest、Host data attributes 和 CSP nonce；style contract tests 与 Zeus CI 全绿。
- C-005 runtime-dom 优化：`bindStyle` 在 style 已不存在时跳过重复 `removeAttribute('style')`，仍在外部重新加入 style 后执行修复；runtime-dom 303 项、Rust compiler、全量 CI 均通过（PR #109）。
- C-005 compiler optimization budget：`pnpm bench:compiler-optimization` 对两份相同静态组件确认只生成 1 个 template factory、2 个 consumer；绑定 fixture 固化 3 个 binding（其中 1 个 `once`）、2 个 reactive effects、1 个 event binding 和 1 个 delegated setup。门禁测试覆盖预算超限失败，CI 的 Native compiler job 强制运行并写入 `temp/bench/compiler-optimization.json`。
- D-001/D-004/D-005/D-006：create-zeus 新模板、VS Code Custom Data、Quick Start/入口文档和 Zeus 产品边界已分别合并（PR #101/#102/#105/#104），对应定向测试、文档检查和 CI 通过。
- E-001/E-002/E-003：Router、Resource、Query adapters 与 RFC-014/RFC-015 已合并（PR #106）；路由浏览器测试、resource/query 定向测试、构建、DTS、exports 和全量 CI 通过。
- Zeus UI U-002/U-004/U-005：schema 驱动 Registry（PR #96）、keyed VirtualList renderer（PR #95）和版本化 Data Grid baseline/report（PR #97）已 squash 合并；UI CI 覆盖类型、构建、单测、Windows、benchmark、showcase E2E 与 docs，均通过。
- Zeus UI U-001：质量等级清单与证据门禁已合并（PR #94）；覆盖 20 个 primitives，提供 `experimental`/`beta`/`stable` 查询与阈值校验，Registry contract、包构建和定向测试通过。
- D-002 create-zeus 覆盖目录安全：`inspectScaffoldTarget` 与 `scaffold` 在最终写入边界拒绝非空目录、文件系统根、cwd/home 及祖先、Git 根和 `.git` 元数据、符号链接/悬空链接、普通文件与模板安装目录；CLI 只有显式 `--force` 才显示默认否的不可撤销确认，并在确认后再次检查目标。验证：create-zeus 安全/CLI/scaffold 定向测试 27 项通过，四模板 `pnpm check:create-zeus`（TS 检查、Vite 构建、应用/组件库 Vitest smoke）通过。
- E-001/E-008 Admin：`examples/admin` 通过公共 Router/Zeus workspace 包构建，集成真实 Zeus UI Input/Dialog/DataGrid 与 Resource/Query，覆盖嵌套 layout、用户列表/参数详情、可取消本地 loader、缓存查询、搜索/筛选/分页/选择、权限重试、预加载、真实 history、编辑表单和异步保存状态；`pnpm check:admin` 对生产产物在 Chromium、Firefox、WebKit 验证无 document 刷新的客户端导航、layout DOM identity、前进/后退、深链接刷新和 403/404/500。报告与截图保存到 `temp/admin/`，CI packed-consumers job 运行并上传。
- E-006/E-007 SSR：SSR codegen/native 执行与 runtime 测试覆盖自定义元素 DSD、Host/Slot、definition option CSS、Manifest 驱动 shadow/default/reflect policy 和确定性首屏值；`styles`/`styleNonce` 不属于 Manifest，CSS 扩展点由 `cssParts`/`cssVars` 描述。SSR 保留 `formAssociated` 声明但不模拟浏览器 `ElementInternals` 生命周期。`ssrHydrationMarker` 与 `hydratePlan` 通过显式 marker plan 复用已有 DOM、绑定文本/属性/属性值/事件并在 scope dispose 时清理；streaming 和自动 hydration 仍在已定义边界之外。
- E-009 Web UI reference：`scripts/testing/packed-consumers/component.tsx.fixture` 是唯一组件源码，隔离 tarball 构建 Native/React18/React19/Vue3 三种消费工程，`pnpm check:web-ui-reference` 记录 SSR import、types、production build 与 Chromium/Firefox/WebKit 行为矩阵，契约见 `docs/internal/web-ui-reference.md`。
- U-003 Data Grid layering：Zeus UI PR #104 基于 `origin/main=ef7d51a` 完成 Renderer/WC Host 分层；`createDataGridHostAdapter` 负责连接生命周期与 scheduler/renderer 清理，Renderer contract 可在无 DOM 环境下测试，reconnect 使用 `clear()` 保持 adapter 可复用，永久 `dispose()` 拒绝后续 reconcile。局部 check、构建、exports、lint、34 项定向测试及完整 175 项 unit 通过，PR #104 已合并且远程 CI 全绿。

### 完成性复审（2026-10-19）

本次重新按原始任务及设计验收，撤回了证据不足项目的完成标记。当前总目标尚未完成；详细缺口及依赖见 [完成性审计](./roadmap-completion-audit-2026-10-19.md)。既往记录是历史切片证据，不代表这些完整验收已通过。

### 增量复审（2026-10-21）

- Zeus UI beta.33 的 FormField/DropdownMenu 行为实现已在工作区，但真实 dist runtime 尚未通过：
  7 项 jsdom runtime 测试在 Zeus beta.15 下失败，根因为 light-DOM mount 丢弃宿主原始子节点；
  Zeus 当前分支已有保留节点修复，需先完成修复版集成再复验 UI runtime。
- Zeus UI Phase 13 的主题生成器与带路径安全校验的 `theme add` 已在工作区完成并通过 CLI/主题测试。
- `npm whoami --registry=https://registry.npmjs.org/` 已认证为 `baicie2`，包 ACL 为 read-write，
  但账户 2FA 关闭；历史 native `latest` 删除在 workflow run `39535665906` 和官方源本机重试中均返回 E403。
  稳定版发布与该 dist-tag 清理尚未完成。
- Zeus PR #143 的 head `8ce0df3` 有一轮 packed-consumers 的 WebKit Admin 页码断言失败
  （搜索后仍显示第 2 / 3 页）；同一 CI 批次另一轮通过，本地 `pnpm check:admin` 三浏览器通过，
  需消除或复现该时序差异并取得同一 head 的全绿 CI 后再合并。
- Golden 真实 registry tarball 的既有 React18/19 SSR import 与 Vue3 具名 Slot 失败仍未被新版本发布后的
  消费者矩阵重新证明；本轮重跑另因 GitHub 源码快照网络 fetch 失败而中止。D-006 的真实新用户计时
  由用户确认暂时无法安排，按用户要求保留未完成；B-003、E-009、F-011 与总目标也继续保持未完成。

### 后续状态复核（2026-10-21）

- 随后执行 `npm whoami --registry=https://registry.npmjs.org/` 返回 E401。此前同日成功认证为
  `baicie2` 并读取到包 ACL 的结果属于较早会话，不是当前发布或删除 dist-tag 的认证证明。
- Zeus PR #143 已合并到 `main`，merge commit 为 `40f887b`；合并前最新 build、test、lint、Rust、
  packed-consumers 与 Admin 浏览器检查通过。本地 `main` 与 `origin/main` 同步，工作区干净。
- registry 上 Zeus beta 仍为 `0.1.1-beta.15`；`@zeus-js/compiler-native` 的 `latest` 仍指向
  `0.1.1-canary.20260812.106.1.658fe407`，历史清理仍受先前记录的 E403 阻塞。B-003/E-009
  需要在修复版 Zeus 与新 UI tarball 发布后重新运行 Golden 和来源验证。
- Zeus UI registry beta 仍为 `0.1.0-beta.32`，`0.1.0-beta.33` 查询返回 E404；beta.33 及
  稳定版尚未发布，发布后消费者和 provenance 验收未完成。D-006 的真实新用户 15 分钟计时
  由用户明确表示暂时无法安排，按要求保留未完成；F-011、B-003、E-009 和总目标继续未完成。

### 当前审计快照（2026-10-22）

Zeus `origin/main` 已合并 PR #145，当前提交为 `61015c2`；本地工作区干净且本地 `main` 已同步。
该提交触发的 Release Canary run `39655474019` 中 release-preflight 与 8 个 native prebuild 已通过，
但 release-canary 仍在运行；beta.16 尚未发布，官方 npm 源当前认证为 E401。UI PR #111 仍为
OPEN/BLOCKED，head `ab948db` 已修复 beta.33 benchmark 版本断言，本机 Node unit 759/759 通过；Linux
DataGrid E2E 仍因 beta.15 runtime 的 diagnostics 时钟读取失败，Windows 的过期 beta.32 断言已修复，
Node/jsdom 阶段通过。完整 showcase route smoke 的序列微任务问题仍待修复版 runtime 集成后复验。
B-003/E-009/F-011 与总目标继续保持未完成，D-006 按用户明确要求保留未完成。

### 增量状态（2026-10-22，beta.16 发布追踪）

Zeus `main` 已提交并推送 `a6f97c7`，创建 tag `v0.1.1-beta.16`。本地 release precheck
通过；GitHub Release run `39665117063` 仍 pending，官方 registry 对 `@zeus-js/zeus@0.1.1-beta.16`
返回 E404，因此 beta.16 尚不能作为已发布依赖。Release Canary run `39665108731` 正在执行
`Publish canary`，与 beta Release 共享 `npm-release` 互斥组。

截至本记录，Zeus CI、Docs、Native Matrix 和 Component Host Bench 的 `a6f97c7` 检查通过；
UI PR #111 仍 OPEN。其 Data Grid E2E 只在 beta.15 runtime 上因 diagnostics 默认计时失败，须待
beta.16 在 registry 可见后更新锁文件并重跑全量 UI CI；完整 showcase route smoke 的偶发问题
没有稳定复现，禁止跳过用例或放宽超时。UI Phase 15 的稳定版发布与消费者/source provenance
验收仍待完成。

官方 registry 的 `@zeus-js/compiler-native` `latest` 仍是旧 canary
`0.1.1-canary.20260812.106.1.658fe407`，F-011 清理未完成；B-003/E-009 仍缺新发布版本的
真实 Golden tarball、供应链和消费者矩阵；D-006 仍缺真实新用户 15 分钟匿名计时记录，用户已
明确要求留未完成。因此路线图和总目标均保持进行中。

### 增量状态（2026-10-22，beta.16 registry 与 UI 对齐复核）

- Zeus `v0.1.1-beta.16` 已由 Release run `39665117063` 成功发布；官方 registry 已可读取
  `@zeus-js/zeus@0.1.1-beta.16`、`@zeus-js/compiler-native@0.1.1-beta.16` 及 beta dist-tag。
  新 Canary run `39669096549` 针对 main `c8ec9d2` 仍在执行 native/promotion 流程，不能把其
  未完成状态当作成功证据。`@zeus-js/compiler-native` 的 `latest` 仍指向旧 canary，F-011 继续未完成。
- Zeus main CI run `39669096532` 仅在 GitHub WebKit 的 Admin 选择断言失败；本机 Chromium/Firefox/WebKit
  的 `pnpm check:admin` 及独立 WebKit 重复流程均通过，失败尚不能稳定复现，已安排 workflow 重跑，
  不放宽断言。
- Zeus UI PR #111 已将根包及 31 个 workspace 包的依赖、peer range、lockfile 和 beta 对齐门禁更新至
  `0.1.1-beta.16`，当前 head 为 `95d478a`。本机 frozen install、对齐测试 11/11、Data Grid E2E
  114/114、TypeScript、严格 release readiness 与 Phase 24 gate 通过；PR 的新 CI 和完整
  `test-unit` 仍待完成。UI beta.33/0.1.0 尚未发布，故 B-003/E-009 的新 registry Golden、
  provenance 和独立消费者证据仍缺失。
- 当前机器 `npm whoami --registry=https://registry.npmjs.org/` 返回 E401，不能在本地执行发布或
  dist-tag 删除；D-006 的首次接触用户 15 分钟计时仍按用户要求留未完成。B-003、E-009、F-011、
  D-006 和总目标继续保持进行中。

### 增量状态（2026-10-22，最终 main Canary 复核）

- PR #148 已合并为 main `3e0e622`。对应 Release Canary run `39679103278` 全部通过：8 个
  Native prebuild、Canary 发布、Sigstore provenance、Node 22/24 registry smoke 和下游 UI
  dispatch 均成功；`canary` dist-tag 当前为
  `0.1.1-canary.20261021.202.1.3e0e6220`。
- `@zeus-js/compiler-native` 的 `latest` 仍指向历史
  `0.1.1-canary.20260812.106.1.658fe407`，且本机官方 registry `npm whoami` 返回 E401；
  F-011 的历史 dist-tag 清理仍需具备删除权限的发布环境完成。
- UI PR #111 已加入 DropdownMenu 方向键打开、FormField caller-owned 状态保留及回归测试，
  head `6f751d4`；定向 runtime、类型、格式检查通过，PR CI 正在重跑。UI beta.33 和稳定版
  尚未发布，因此 B-003/E-009 的新 registry Golden、provenance 和独立消费者报告仍缺失。
- D-006 仍没有首次接触 Zeus 用户的 15 分钟匿名计时记录，按用户明确要求保持未完成；所以
  B-003、E-009、F-011、D-006 与本总目标均不能标记完成。

### 增量状态（2026-10-22，UI beta.33 PR 最终 E2E 复核）

- UI PR #111（`codex/ui-beta33-release-prep`，head `812d1b0`）的 build、docs、showcase
  build/unit/metadata、lint/DTS、Windows、Data Grid benchmark/framework-browser 和普通
  unit checks 均通过；两次独立 CI run `39704468981`、`39704473420` 的 `showcase / e2e`
  均失败，且失败集合一致（8 个文件、16/113 项）。失败覆盖 checkbox/switch/radio
  accessibility、chat、accordion/tabs、dialog、settings 和 select，包含缺少
  `aria-orientation`、内容未渲染、元素不可见、重复 placeholder 及 30 秒超时等证据。
  这不是 Popover 单点回归；PR 保持 `OPEN/BLOCKED`，不能合并或发布 UI beta.33。
- 本地 `pnpm showcase:e2e` 的依赖构建成功，但 5173 被另一个项目进程占用，global setup
  无法启动 showcase servers；未终止外部进程，也未以本地不完整运行替代 CI 失败证据。
- 本机再次使用官方源 `https://registry.npmjs.org` 执行 `npm whoami` 仍返回 E401；只读查询
  仍显示 `@zeus-js/zeus@beta=0.1.1-beta.16`、`@zeus-web/ui@beta=0.1.0-beta.32`，UI
  beta.33 尚未发布。历史 `@zeus-js/compiler-native@latest` 仍指向旧 canary，F-011 不能关闭。
- D-006 仍没有首次接触 Zeus 用户的 15 分钟匿名计时记录，且用户明确要求保留未完成；因此
  UI 发布后的 B-003/E-009、F-011、D-006 与本总目标继续保持未完成。

## 2026-10-22 beta.17 发布与 UI 回归收口

Zeus PR #151 已修复 lazy 子树的祖先初始化、移动与重连等待，PR #152 已修复 Golden
Manifest 的 canonical `schemaVersion` 校验，并准备 `0.1.1-beta.17`。两 PR 均已通过
CI 后合并；`v0.1.1-beta.17` 指向 main `c10df229893d80f63c4ad0aa28abc814b02c0020`。
正式 Release run `39784468635` 的七平台 Native prebuild、npm 认证、完整 release
precheck、29 包发布、dist-tag/provenance 和 Node22/24 registry smoke 均已通过，GitHub
Release 已创建。同 SHA 冗余 Canary 在 prebuild 阶段已取消，未进入 publish。

UI PR #111 仍在收口。已修复原生 property 绑定、Select 布尔属性观察循环、Popover
metadata、Toast 移出计时、菜单 Tab 退出与高级组件 DOM 状态响应式；高级 runtime
测试 10 文件/141 项通过，CI 已覆盖全部高级 runtime 测试。FormField 清理、跨容器
控件移交回归已通过；官方 beta.17 下断开重连仍有 1/11 失败：light Slot 在父元素
投影时触发过期的子元素 `connectedCallback`，使子元素在临时 DocumentFragment 中重建且
读不到 DOM context。已在 Zeus beta.17 源码复现；仅用 beta.17 依赖的 UI 回归仍失败。
Zeus 下一补丁需保留普通 loaded 重连同步契约，同时修复该过期连接反应，并加入真实
light Slot + DOM context 重连测试；beta.17 tag 不变。UI beta.33 与 0.1.0 尚未发布。

F-011 的历史 Native `latest` 删除仍未完成。run `39535665906` 的 npm 账户与
29 包 read-write ACL 认证通过，但首个精确 DELETE 仍返回通用 E403。现有响应未说明
服务端原因，不能定性为 token 缺少删除权限，也不能定性为 npm 禁止删除 `latest`。
需包 owner 核对包设置、token scope 与 bypass-2FA，并向 npm Support 提交该 run、
请求时间和 DELETE URL 以确认服务端限制或后端清理方式；不得用占位稳定版、移动
历史 tag 或放宽验收替代真实清理。

B-003/E-009 仍需新 registry tarball 的 Golden 完整矩阵与持久化来源证据。Golden
runner 现已从版本合同读取默认 UI/Zeus 版本，刷新合同时不再回退到 beta.32/beta.13；
完整消费与 provenance 报告仍未生成。D-006 按用户要求保留真实新用户计时未完成；路线图
及总目标继续进行中。

## 2026-10-23 beta.18 基线复核（截至 UI beta.33 发布前）

Zeus `main` 已快进到 `19507ad0a0e59e3340a582183f5d035f9df409b6`，PR #153/#154
已合并。beta.18 正式 Release run `39817731859` 已成功；官方 registry 当前
`@zeus-js/zeus@beta` 为 `0.1.1-beta.18`。main CI run `39817094523` 的重跑结果全绿。

Zeus UI PR #111 当时 head 为 `f4cd7bb6c3937b2a06eede8bc6fa53a26dc32093`，尚未合并。
截至本次复核，docs、build-output、DTS/lint、unit、Windows、Data Grid benchmark 与
一轮 showcase E2E 检查通过；另有重复 CI run 仍在浏览器安装阶段，PR 总状态尚未全绿。
随后 UI beta.33 已发布并完成独立 Golden 矩阵；结果见下方“Golden beta.33 验收”增量记录。

`@zeus-js/compiler-native@latest` 仍指向旧 canary
`0.1.1-canary.20260812.106.1.658fe407`；F-011 的精确 tag 清理仍需包 owner 与 npm
Support 处理此前 E403。D-006 仍缺首次接触用户的 15 分钟匿名计时记录；F-011、D-006
和总目标仍保持未完成。

## 2026-10-23 Golden beta.33 验收

- 修正 `scripts/check/check-golden-components.ts` 的消费者夹具：WC lazy exposed methods 返回 Promise，测试现等待焦点、Data Grid 查询/更新等方法完成；Input formatter 场景在前序受控值断言后显式恢复非受控状态。断言范围未放宽。
- 使用 Node 24.16 和官方 npm registry 对 UI `0.1.0-beta.33` / Zeus `0.1.1-beta.18` 执行完整矩阵：Native、React18、React19、Vue3 × Chromium、Firefox、WebKit 共 12/12 通过；4 组 SSR、16 份 Manifest、24 份 tarball integrity，以及 UI 包 16 份 SLSA/Sigstore provenance 证据均通过。报告：[golden-components-acceptance-2026-10-23/report.json](./golden-components-acceptance-2026-10-23/report.json)。
- E-009 关闭；B-003 的四组件 API、来源和跨框架消费验收完成。Golden 报告中的 1000 行时长只作为 observation，不作为跨设备性能阈值。旧基线 `u005-data-grid-2026-10-21` 已由 UI 仓库基于 beta.33 发布提交 `74fe9ea33f7a51eb8551debe9992cebfc1a0ebe7` 生成并合并的 `u005-data-grid-2026-10-23` 替代；新基线的 12 组 render/scroll/update 结果和 signed heap/RSS 趋势已持久化在 UI manifest。
- F-011 仍未完成：`@zeus-js/compiler-native@latest` 仍指向历史 canary；精确 dist-tag 删除此前返回 npm E403，需包 owner/npm Support 处理后重试既有清理 workflow。
- D-006 仍未完成：缺少真实首次接触用户的匿名 15 分钟上手步骤与耗时记录；自动化 Quick Start 不替代人工验收。
- 当时复审仍缺 B-003 的版本化性能基线；该缺口随后由下节 UI PR #112 合并关闭。当前 F-011 与 D-006 仍开放，因此本总目标不能标记完成。

## 2026-10-23 beta.33 Data Grid 基线 PR

- UI beta.33 发布源码 commit `74fe9ea33f7a51eb8551debe9992cebfc1a0ebe7` 上重新执行 Data Grid 的 render/scroll/update 基准，生成 `u005-data-grid-2026-10-23`；记录环境为 Darwin 24.6.0、arm64、Node 26.9.0，覆盖四种场景共 12 组阶段结果，并记录 signed heap/RSS 趋势。
- UI PR [#112](https://github.com/baicie/zeus-ui/pull/112) 的 head `d1eb73610427d21de6711bd6e9362f06381f4148` 已合并，merge commit 为 `eb25d05bb8b249e708e9890f01af86f752674ed4`。基线 checker、Data Grid benchmark contract、文档、benchmark typecheck、lint/DTS 与浏览器 CI 均通过。
- B-003 已关闭。F-011 仍待 npm/包 owner 解决历史 `latest` tag，D-006 仍待真实新用户计时，因此本总目标继续进行。

## 2026-10-23 resumed blocker audit

- 重新触发 `Repair Native Latest` workflow run `39884107912`，使用精确确认串和当前 main。Release 环境的 npm 认证预检通过，但对 `@zeus-js/compiler-native` 执行标准 `dist-tag rm latest` 仍收到 npm E403；registry 查询确认 `latest` 仍为 `0.1.1-canary.20260812.106.1.658fe407`。仓库脚本、工作流参数和 secret 注入均已实际执行，剩余问题需要包 owner 或 npm Support 处理 npm 服务端/包设置。
- D-006 仍只有自动化 Quick Start 报告（`8467 ms`），没有真实首次接触者的匿名 session、步骤时间、阻塞/提问和成功条件记录；自动化报告明确不能替代真人验收。
- UI 仓库的 `docs/mvp/roadmap.md` 仍保留 Phase 15 未完成：`0.1.0` 稳定版发布及发布后的 registry、provenance、独立消费者复核尚未发生；当前 UI `beta` 为 `0.1.0-beta.33`，稳定包查询为 404。该外部发布项与本仓库的 E-009 Golden 验收分开记录，不能互相替代。

## 2026-10-23 release diagnostics and blocker audit continuation

- PR [#161](https://github.com/baicie/zeus/pull/161) 已合并为 `cd3d478`。它为 native `latest` 清理报告增加了 tag 快照、删除前复核、最终一致性等待和脱敏的 npm diagnostics；同时将 Admin 的 Data Grid、Dialog、Input consumer 更新到 UI `0.1.0-beta.33`。PR SHA `edb1c49` 的 pull-request CI 全绿，包含 packed-consumers、Native matrix、Admin 浏览器验收、build、test、docs、bench 和 integration。
- 独立审查随后发现未捕获的 `NpmCommandError` 仍可能把原始 npm stderr 放入异常 stack。PR [#162](https://github.com/baicie/zeus/pull/162) 已合并为 `c822ba4`，在错误构造边界统一脱敏异常 message，并新增 Authorization、URL userinfo/query token 和 JSON credential 的 stack 回归测试；定向测试 10/10、PR CI 和 RC CI 全部通过。
- F-011 仍未完成：`@zeus-js/compiler-native@latest` 仍指向历史 `0.1.1-canary.20260812.106.1.658fe407`；精确删除历史 dist-tag 的 npm E403 仍需包 owner 或 npm Support 处理，不能用新的 diagnostics 报告替代真实删除。
- D-006 仍未完成：用户已再次确认目前无法安排首次接触 Zeus 的真实用户完成 15 分钟上手验收，因此没有新的匿名步骤、耗时、阻塞和成功条件记录；自动化 Quick Start 仍不能替代真人观察。
- UI Phase 15 的 `release:final 0.1.0`、strict readiness、113 项测试和 40 包 tarball dry-run 已通过，但 stable publish、stable tag、registry/provenance 和独立消费者的发布后验收尚未执行。`Release` environment 仍不配置 required reviewer，按用户决定停在发布前；该状态不关闭 UI 路线图或本总目标。
- 本轮主仓库 PR 与本地验证未发现新的代码缺项；F-011、D-006 和 UI 发布后验收仍开放，因此路线图和本总目标继续保持进行中。

## 2026-10-23 UI Phase 15 路线图合并复核

- UI PR [#112](https://github.com/baicie/zeus-ui/pull/112) 已合并为 `eb25d05bb8b249e708e9890f01af86f752674ed4`，beta.33 发布源码上的 Data Grid 版本化性能基线已验收；B-003 与 E-009 均已完成。
- UI PR [#113](https://github.com/baicie/zeus-ui/pull/113) 已合并为 `baa5fdfd6dd94244a299a969912c151590e28278`。独立审阅未发现阻塞问题；PR head `eae0f3b8554b6edfadb82ca1ccd1be50afa4448c` 的较新 CI run `39932551708` 所有 required checks 成功。旧重复 run 的浏览器检查超过 9 分钟未更新，在较新 run 全绿后取消。
- UI 路线图记录的稳定发布前检查为 `release:final 0.1.0`、strict readiness、113 项测试和 40 包 tarball dry-run；稳定版 publish、`v0.1.0` tag、稳定 registry/provenance 与独立消费者发布后复核均未执行。
- 用户明确决定暂不配置 UI `Release` environment 的 required reviewer，先停在发布前；本记录不授权或暗示继续稳定发布。
- D-006 仍缺真实首次接触者的 15 分钟上手验收，用户目前无法安排；F-011 的历史 `@zeus-js/compiler-native@latest` 清理仍受 npm E403 阻塞。两项及本总目标继续保持未完成。

## 2026-10-23 UI PR #114 合并复核

- UI PR [#114](https://github.com/baicie/zeus-ui/pull/114) 已合并为 `d326e68cfbc408f2ed5a6cf74aa8b411d3762d77`；其发布前路线图记录已进入 UI `main`，全部 required CI（build、docs、unit、DTS、Windows、Data Grid、showcase）通过。
- UI Phase 15 仍停在发布前：稳定版 publish、`v0.1.0` tag、稳定 registry/provenance 和独立消费者的发布后复核均未执行；`Release` environment 没有 required reviewer，按用户决定继续暂不配置审核人。
- D-006 仍缺真实首次接触者的 15 分钟上手验收，F-011 的历史 `@zeus-js/compiler-native@latest` 仍因 npm E403 未清理；两项及本总目标继续保持未完成。

## 2026-10-23 create-zeus 0.1.3 发布复核

- PR [#168](https://github.com/baicie/zeus/pull/168) 已合并为 `b9fc4eb96e7d86e218dc5161b13db5664ebbfa01`；`create-zeus@0.1.3` tag 已推送，Devtools Release run [39968935677](https://github.com/baicie/zeus/actions/runs/39968935677) 的构建、模板依赖、CommonJS/exports、打包消费者和 npm 可见性校验全部通过。
- 官方 npm registry 已核验 `create-zeus` 的 `version=0.1.3`、`latest=0.1.3`。发布 tarball 包含 `basic-ts`、`application-ts`、`component-library-ts`、`web-component-ts` 四个模板，并包含组件库模板的 `greeting.tsx`、`index.ts` 和 `styles.css`。
- D-001 的四模板发布证据已补齐；新增中文《首次 15 分钟》流程并链接到选择指南。自动化 Quick Start 仍只验证流程可运行，不能替代 D-006 所需的真人首次接触验收。
- F-011 的历史 native `latest` 清理、D-006 真人验收和 UI Phase 15 稳定发布仍按前述用户决定保持未完成；本总目标继续进行中。

## 2026-10-24 create-zeus 0.1.4 依赖修复复核

- 用户从 `Component Library TypeScript` 模板生成的隔离项目在 `vite build` 加载 Vue wrapper 时报告 `ERR_MODULE_NOT_FOUND: vue`；补装框架依赖后又暴露了虚拟产物对 `@zeus-js/runtime-dom`、`@zeus-js/web-c-runtime` 和两个 wrapper runtime 的直接解析要求。
- PR [#170](https://github.com/baicie/zeus/pull/170) 已合并为 `a2af3419de77daf58071e02a9dde511d5a492896`。模板现在直接声明 `react`、`vue`、`@types/react`、`@zeus-js/runtime-dom`、`@zeus-js/web-c-runtime`、`@zeus-js/output-react-wrapper` 和 `@zeus-js/output-vue-wrapper`，并将 `create-zeus` 升级到 `0.1.4`。
- Devtools Release run [40067431820](https://github.com/baicie/zeus/actions/runs/40067431820) 已成功；官方 npm registry 的 `latest` 已指向 `0.1.4`，下载 tarball 已核验七项依赖均进入组件库模板。用户项目重新执行 `pnpm check && pnpm build && pnpm test` 全部通过。
- D-006 真人验收、F-011 native `latest` 清理和 UI Phase 15 稳定发布仍按既有用户决定保持未完成；本总目标继续进行中。

## 2026-10-24 用户决定：D-006 完成、F-011 放弃

- 用户实际完成 `Component Library TypeScript` 首次上手流程，反馈整体约 10 分钟内完成；过程中根据报错修复了模板依赖，并协助澄清 HTML 预览路径。最后一步查看生成的 HTML 是主要卡点。页面实际显示组件问候文本和 `Hello from a slot` 投影内容，`pnpm check`、`pnpm build`、`pnpm test` 均通过。D-006 按用户确认关闭；记录采用用户提供的近似总耗时，未虚构逐步精确计时，也不把本次有协助的流程表述为无协助的可用性实验。
- 用户决定放弃 F-011 的历史 `@zeus-js/compiler-native@latest` 删除，不再尝试 npm E403 的删除操作；后续 0.2.0 版本发布不再以该历史 tag 为阻塞项。该决定已记录为“放弃/不再追踪”，不是将删除操作伪称成功。
- 本次用户决定解除 Zeus 侧的 D-006/F-011 阻塞；UI Phase 15 稳定版发布仍需完成版本准备、发布工作流和发布后 registry/provenance/独立消费者核验。
- 正式发布不再预先要求删除 native 包的历史 `latest`。发布后仍逐包校验本次目标版本和目标 dist-tag、Sigstore provenance 及 compiler registry smoke；稳定版必须把 `latest` 推进到本次稳定版本，不能用放弃历史清理绕过本次发布结果验证。
