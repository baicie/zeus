# Compiler Semantic Matrix

日期：2026-10-30。基线：`d853352`。范围：Zeus 0.2.0 设计包 PR-06（Rust Compiler 语义、诊断与 SourceMap），
对应 `design/01-CORE-COMPILER-RUNTIME.md` 的 Compiler Semantic Matrix 与 G2。

本文记录 Rust 编译器（`crates/zeus_compiler`，经 `@zeus-js/compiler-native` N-API 加载）每项 TSX 语义在
DOM / SSR 两个 target 上的现有测试证据、本 PR 新增的 fixture 测试，以及仍然缺失的格子（GAP）与已确认的编译器缺陷。
IR 快照属于内部实现，不作为公开契约，因此矩阵不设 IR 列。

> 2026-10-31 更新：C1–C12 已全部修复，Q1、Q2 已裁决，修复状态见“缺陷修复状态”一节。下方矩阵格子中的
> `[缺陷 Cn]` 保留为发现记录，对应修复的回归测试列在该节。`cargo test --workspace --locked` 现已可在本机运行。

## 证据来源与运行条件

| 缩写  | 文件                                                                   | 说明                                                                                   |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `MR`  | `packages/core/compiler/__tests__/semantic-matrix-runtime.spec.ts`     | 本 PR 新增。双 target 编译并执行：DOM 在 JSDOM 中运行，SSR 在移除全部 DOM 全局后运行。 |
| `MD`  | `packages/core/compiler/__tests__/semantic-matrix-diagnostics.spec.ts` | 本 PR 新增。逐个诊断码断言 code、filename、line、column、UTF-8 offset。                |
| `NI`  | `packages/core/compiler-native/__tests__/integration.test.cjs`         | 既有。经 Vite 加载 native 编译结果并执行。                                             |
| `NC`  | `packages/core/compiler-native/__tests__/contract.test.cjs`            | 既有。N-API 结果结构与 ABI 错误。                                                      |
| `CC`  | `packages/core/compiler/__tests__/native-contract.spec.ts`             | 既有。`@zeus-js/compiler` 公共入口。                                                   |
| `VSM` | `packages/devtools/vite-plugin/__tests__/source-map.spec.ts`           | 既有。Vite dev / build / Rollup 的 source map。                                        |
| `VSE` | `packages/devtools/vite-plugin/__tests__/ssr-execution.spec.ts`        | 既有。经插件编译的 SSR 输出在 Node 中执行。                                            |
| `VT`  | `packages/devtools/vite-plugin/__tests__/transform.spec.ts`            | 既有。诊断经 Vite / Rollup 结构化传递。                                                |
| `RT`  | `crates/zeus_compiler/tests/transform.rs`                              | 既有 Rust 测试。本环境 cargo 依赖不在离线缓存，**未运行**，只作为“存在的覆盖”引用。    |
| `RL`  | `crates/zeus_compiler/tests/lower.rs`                                  | 同上。                                                                                 |

运行条件与限制：

- JS 侧测试使用仓库内 `packages/core/compiler-native/zeus-compiler-native.darwin-arm64.node`（构建于
  2026-10-21 02:52，晚于 `crates/` 与 `compiler-native/src` 的最后一次提交 2026-10-21 01:17）。无法证明构建时
  工作树干净；二进制无法在本环境重建。
- 浏览器断言为 BLOCKED（沙箱不允许监听本地端口），全部以 JSDOM 代替。Shadow DOM、`assignedNodes`、事件传播
  均为 JSDOM 语义，不等于三引擎证据。
- `packages/core/runtime-dom/__tests__` 与 `packages/core/runtime-ssr/__tests__` 直接调用 runtime helper，
  不经过编译器（`scripts/testing/compile-test-views.ts` 只编译 `examples/headless/src`），因此不计入编译器覆盖。
- fixture 以内联源码写在 spec 中，文件名统一为 `input.tsx`；生成代码以执行结果断言，不对代码文本做快照
  （代码形状属于内部实现）。

## 矩阵

格子标记：`[已有]` 本 PR 前已有测试；`[已有+新增]` 已有测试且本 PR 补充了 JS 侧执行证据；`[新增]` 本 PR 前为
GAP、现由新增测试覆盖；`[GAP]` 无测试；`[缺陷 Cn]` 测试暴露编译器缺陷（见下文，未提交失败测试）；`[N/A]` 该语义在此列不适用。

列含义：DOM 输出 / SSR 输出 = 生成代码执行后的结果；诊断码 = 非法用法的结构化诊断；Source map = 生成位置映射回原始
行列；运行时 = JSDOM 中挂载、更新、清理行为；Parity = 同一源码 DOM/SSR 的 hydration plan 稳定 ID 一致、SSR 标记与计划一致、
DOM 与 SSR 渲染结果结构等价。

| 语义                                       | DOM 输出                                                                                                                                                                            | SSR 输出                                                                                                                                                                    | 诊断码                                                                                                                                                                                                                                        | Source map                                                                                                                                          | 运行时（JSDOM）                                                                       | Parity（plan ID）                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原生标签：静态模板、动态文本、attribute    | `[已有+新增]` NI › native compiler executes through Vite with fine-grained DOM updates；MR › native element, attributes, text and template literals                                 | `[已有+新增]` NI › native compiler executes SSR output through runtime-ssr；MR › 同左 fixture                                                                               | `[已有+新增]` RL › rejects_elements_whose_children_need_dedicated_anchor_codegen；MD › `ZEUS_UNSUPPORTED_DOCUMENT_ELEMENT` / `ZEUS_UNSUPPORTED_TEMPLATE_ELEMENT` / `ZEUS_UNSUPPORTED_VOID_ELEMENT_CHILDREN`                                   | `[已有+新增]` NI（assertExpressionMapping）；VSM；MR › maps every dom/ssr expression back to the original line and column                           | `[已有+新增]` NI 同上；MR parity（更新后元素 identity 不变）                          | `[已有+新增]` RT › emits_stable_hydration_plan_and_ssr_markers_for_dom_and_ssr_targets；MR › native element… : DOM matches SSR before and after updates |
| Custom Element 标签（原生 CE tag）         | `[已有+新增]` NI（`Special` 中的 `z-card`）；MR › custom element tag with attributes and slotted children                                                                           | `[新增]` MR › 同左 fixture                                                                                                                                                  | `[N/A]` 无 CE 专属诊断码                                                                                                                                                                                                                      | `[GAP]`                                                                                                                                             | `[已有+新增]` NI；MR parity                                                           | `[新增]` MR › custom element tag… : DOM matches SSR…                                                                                                    |
| `defineElement` + `Host` / `Slot`          | `[已有+新增]` NI › native compiler executes defineElement Host and Slot boundaries（light DOM）；MR › compiles defineElement Host and Slot for both targets from one plan（shadow） | `[已有+新增]` NI › native compiler executes SSR Web Components with DSD, styles and slots；VSE › executes compiled custom-element definitions into first-paint DSD；MR 同左 | `[已有+新增]` RL › validates_host_and_slot_builtin_boundaries；VT › propagates structured compiler diagnostics through Vite errors；MD › `ZEUS_INVALID_HOST_USAGE` / `ZEUS_INVALID_SLOT_USAGE` / `ZEUS_INVALID_SLOT_NAME`                     | `[GAP]`                                                                                                                                             | `[已有+新增]` NI；MR（命名 slot 分配、attribute 更新保持节点）                        | `[新增]` MR（DOM/SSR plan 相等）                                                                                                                        |
| 组件 Props / children                      | `[已有+新增]` NI › native compiler initializes components once with lazy props and children；MR › component props and children                                                      | `[已有+新增]` RT › emits_ssr_native_component_and_control_flow_calls；MR 同左                                                                                               | `[已有+新增]` RL › preserves_component_prop_names_without_dom_alias_normalization；MD › `ZEUS_UNSUPPORTED_COMPONENT_PROP_NAMESPACE` / `ZEUS_UNSUPPORTED_COMPONENT_NAME`                                                                       | `[已有+新增]` RT › emits_component_calls_with_lazy_props_and_initialized_children；MR（`props.nu`）                                                 | `[已有+新增]` NI；MR parity（父组件节点不重建）                                       | `[新增]` MR › component props and children…                                                                                                             |
| `ref`                                      | `[已有+新增]` NI（`Bindings` 的 `inputRef`）；RT › emits_attribute_property_and_ref_bindings_with_stable_locators；MR › binds refs and events in DOM and omits them from SSR        | `[新增]` MR 同左（SSR 不输出 ref）                                                                                                                                          | `[已有+新增]` RL › reports_stable_attribute_binding_diagnostics；MD › `ZEUS_INVALID_REF_USAGE` / `ZEUS_EMPTY_EXPRESSION`                                                                                                                      | `[GAP]`                                                                                                                                             | `[已有+新增]` MR（挂载传入元素，dispose 后传 null）                                   | `[新增]` MR（plan 相等）                                                                                                                                |
| event                                      | `[已有+新增]` NI（inline / identifier / member / optional / computed handler 与 currentTarget）；RT › emits_event_bindings_and_sorted_deduplicated_delegation；MR 同上              | `[已有+新增]` VSE（输出不含 `onClick`）；MR 同上                                                                                                                            | `[已有+新增]` NC › once bindings use the runtime flag and invalid targets fail；MD › `ZEUS_INVALID_ONCE_TARGET`                                                                                                                               | `[已有+新增]` RT 同左；MR（`props.zeta`，仅 DOM）                                                                                                   | `[已有+新增]` NI；MR；另见缺陷 C4（非冒泡事件、`delegateEvents: false`）              | `[新增]` MR › reconnects every planned binding to server HTML without replacing nodes（event binding）                                                  |
| class / style                              | `[已有+新增]` NI（`Bindings`）；MR › class and style objects                                                                                                                        | `[已有+新增]` VSE › executes compiled components with the real SSR runtime in Node；MR 同左                                                                                 | `[N/A]`                                                                                                                                                                                                                                       | `[新增]` MR（`props.beta`）                                                                                                                         | `[已有+新增]` NI；MR                                                                  | `[新增]` MR › class and style objects…                                                                                                                  |
| `prop:` 属性（SSR 白名单内）               | `[已有+新增]` NI（`prop:value`）；MR › serializes supported SSR form properties and sets DOM properties                                                                             | `[已有+新增]` VSE；MR 同左                                                                                                                                                  | `[已有+新增]` RL › reports_stable_attribute_binding_diagnostics；MD › `ZEUS_INVALID_PROPERTY_BINDING`                                                                                                                                         | `[新增]` MR（`props.epsilon`）                                                                                                                      | `[已有+新增]` MR（value / checked / disabled / htmlFor 更新）                         | `[新增]` MR › reconnects…（prop binding）                                                                                                               |
| `prop:` 属性（SSR 无 HTML 等价表示）       | `[N/A]` DOM 正常设置 property                                                                                                                                                       | `[缺陷 C5]`                                                                                                                                                                 | `[缺陷 C5]`                                                                                                                                                                                                                                   | `[N/A]`                                                                                                                                             | `[N/A]`                                                                               | `[缺陷 C5]`                                                                                                                                             |
| Fragment（根与嵌套）                       | `[已有+新增]` NI › native compiler preserves root and nested Fragment identity；MR › root and nested fragments                                                                      | `[已有+新增]` RT › emits_ssr_native_component_and_control_flow_calls；MR 同左                                                                                               | `[新增]` MD › `ZEUS_UNSUPPORTED_SPREAD_CHILD`                                                                                                                                                                                                 | `[已有]` RT › emits_root_and_nested_fragment_templates_with_stable_markers                                                                          | `[已有+新增]` NI；MR                                                                  | `[新增]` MR › root and nested fragments…                                                                                                                |
| `Show` / `For`                             | `[已有+新增]` NI › native compiler mounts Show and keyed For regions with cleanup、keeps root and nested For regions reactive；MR › Show and For control flow                       | `[已有+新增]` VSE；RT › emits_ssr_native_component_and_control_flow_calls；MR 同左                                                                                          | `[已有+新增]` RL；MD › `ZEUS_FUNCTION_BUILTIN_VALUE` / `ZEUS_INVALID_BUILTIN_USAGE` / `ZEUS_INVALID_FOR_CHILD` / `ZEUS_INVALID_SHOW_FALLBACK` / `ZEUS_UNSUPPORTED_FOR_CALLBACK_PARAMETER` / `ZEUS_UNSUPPORTED_BUILTIN_SPREAD`                 | `[新增]` MR（`props.eta` 至 `item.mu`）                                                                                                             | `[已有+新增]` NI；MR                                                                  | `[已有+新增]` RT 同首行；MR（列表 optional 标记可重复，非 optional 恰好一次）                                                                           |
| template literals                          | `[新增]` MR › native element, attributes, text and template literals                                                                                                                | `[新增]` MR 同左                                                                                                                                                            | `[N/A]`                                                                                                                                                                                                                                       | `[新增]` MR（`props.xi`）                                                                                                                           | `[新增]` MR                                                                           | `[新增]` MR                                                                                                                                             |
| JSX 条件 / 逻辑 / `Array.map` / 数组字面量 | `[已有+新增]` NI › native compiler mounts dynamic JSX arrays and delegates branch events；MR › JSX conditional and logical expressions、Array.map JSX region                        | `[已有+新增]` NI › native compiler renders conditional, mapped, and array JSX through SSR；MR 同左                                                                          | `[已有+新增]` RL › diagnoses_unsupported_nested_jsx_conditions_and_array_map_parameters；MD › `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION` / `ZEUS_UNSUPPORTED_ARRAY_MAP_CALLBACK_PARAMETER` / `ZEUS_UNSUPPORTED_ARRAY_SPREAD`                    | `[已有+新增]` VSM › maps dynamic expressions through the plugin transform；MR（`props.omicron`、`props.pi`）                                        | `[已有+新增]` NI；MR                                                                  | `[新增]` MR                                                                                                                                             |
| 有序 Spread（RFC-008）                     | `[已有+新增]` NI › native compiler executes ordered spreads and preserves component and function identities；MR › ordered native spread                                             | `[已有+新增]` NI › native compiler executes ordered spreads through SSR without DOM globals；MR 同左                                                                        | `[已有+新增]` RL › rejects_nested_jsx_in_spreads_and_spreads_on_compiler_builtins；MD › `ZEUS_UNSUPPORTED_BUILTIN_SPREAD`                                                                                                                     | `[已有+新增]` RT › maps_spread_nested_jsx_dynamic_attributes_and_higher_order_callbacks；VSM；MR（`props.gamma`）                                   | `[已有+新增]` NI；MR                                                                  | `[新增]` MR › ordered native spread…                                                                                                                    |
| `once()`（RFC-013）                        | `[已有+新增]` NC；NI（`OnceBindings`）；MR › keeps once bindings fixed in DOM while marking them in both plans                                                                      | `[新增]` MR 同左                                                                                                                                                            | `[已有+新增]` NC；RL › rejects_invalid_once_intrinsic_shapes_and_non_dom_targets；MD › `ZEUS_INVALID_ONCE_INTRINSIC` / `ZEUS_INVALID_ONCE_TARGET` / `ZEUS_MIXED_RAW_TEXT_BINDING_MODE`                                                        | `[已有]` RT › emits_once_intrinsics_without_changing_default_bindings                                                                               | `[已有+新增]` NI；MR（更新后 once 绑定不变）                                          | `[新增]` MR（两个 plan 的 `once` 标志一致）                                                                                                             |
| SVG namespace                              | `[已有+新增]` NI（`Icon`）；RT › emits_svg_namespace_flag_and_valid_void_custom_templates；MR › SVG namespace                                                                       | `[新增]` MR 同左                                                                                                                                                            | `[N/A]`                                                                                                                                                                                                                                       | `[GAP]`                                                                                                                                             | `[已有+新增]` NI；MR                                                                  | `[新增]` MR                                                                                                                                             |
| `Transition`                               | `[已有]` NI › native compiler lowers Transition intrinsic to mountTransition                                                                                                        | `[已有]` RT › emits_transition_mount_for_dom_and_static_branch_for_ssr                                                                                                      | `[已有+新增]` RL › diagnoses_transition_unknown_and_jsx_options；MD › `ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE`                                                                                                                                  | `[GAP]`                                                                                                                                             | `[已有]` NI                                                                           | `[GAP]`                                                                                                                                                 |
| `ErrorBoundary`                            | `[GAP]` 编译输出未在 JSDOM 执行（`errorBoundary.spec.ts` 只测 runtime）                                                                                                             | `[N/A]` SSR 按设计拒绝                                                                                                                                                      | `[新增]` MD › `ZEUS_INVALID_ERROR_BOUNDARY_FALLBACK` / `ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED`                                                                                                                                                  | `[GAP]`                                                                                                                                             | `[GAP]`                                                                               | `[N/A]`                                                                                                                                                 |
| async 不支持                               | `[缺陷 C6]` 无 `await` 时 MR › never renders an async component silently in either target 证明 runtime 拒绝；有 `await` 时输出语法错误                                              | `[新增]` MR 同左（`renderToString` 抛错）                                                                                                                                   | `[缺陷 C6]` 无编译期诊断                                                                                                                                                                                                                      | `[N/A]`                                                                                                                                             | `[新增]` MR 同左                                                                      | `[N/A]`                                                                                                                                                 |
| SSR 动态值转义                             | `[新增]` MR › escapes dynamic text and attributes in SSR and keeps DOM text literal（DOM 不解析为标签）                                                                             | `[已有+新增]` VSE；MR 同左                                                                                                                                                  | `[N/A]`                                                                                                                                                                                                                                       | `[N/A]`                                                                                                                                             | `[新增]` MR 同左                                                                      | `[新增]` MR parity 首行 fixture（值含 `<b>`、`&`、`"`）                                                                                                 |
| SSR 静态文本转义（JSX 实体）               | `[已有]` NI（`Static`：`A &amp; &#x1F600;` 为文本）                                                                                                                                 | `[缺陷 C1]`                                                                                                                                                                 | `[N/A]`                                                                                                                                                                                                                                       | `[N/A]`                                                                                                                                             | `[已有]` NI                                                                           | `[缺陷 C1]`                                                                                                                                             |
| raw text：`script` / `style`               | `[已有+新增]` NI（`Special`）；RT › emits_raw_text_bindings_and_preserves_raw_template_text；MR › keeps script and style raw text closed in SSR and literal in DOM                  | `[已有+新增]` VSE；MR 同左（`</script>`、`</style>` 不提前闭合）                                                                                                            | `[已有+新增]` RL › lowers_supported_raw_text_elements_and_rejects_nested_elements；MD › `ZEUS_UNSUPPORTED_RAW_TEXT_CHILD` / `ZEUS_UNSUPPORTED_RAW_TEXT_ELEMENT`                                                                               | `[已有]` RT › emits_raw_text_bindings_and_preserves_raw_template_text                                                                               | `[已有+新增]` NI；MR                                                                  | `[新增]` MR 同左（plan 相等）                                                                                                                           |
| raw text：`textarea` / `title`（RCDATA）   | `[已有]` NI（`Special`）                                                                                                                                                            | `[缺陷 C2]`                                                                                                                                                                 | `[N/A]`                                                                                                                                                                                                                                       | `[GAP]`                                                                                                                                             | `[已有]` NI                                                                           | `[缺陷 C2]`                                                                                                                                             |
| unsafe RawText（`prop:innerHTML`）         | `[GAP]` 待裁决 Q1                                                                                                                                                                   | `[GAP]` 待裁决 Q1                                                                                                                                                           | `[GAP]` 待裁决 Q1                                                                                                                                                                                                                             | `[N/A]`                                                                                                                                             | `[GAP]`                                                                               | `[GAP]`                                                                                                                                                 |
| Source map 行列与 offset                   | `[N/A]`                                                                                                                                                                             | `[N/A]`                                                                                                                                                                     | `[已有+新增]` RL › reports_utf8_offsets_and_utf16_columns_across_crlf；MD（每个诊断在 CRLF + emoji + CJK 前缀下断言 offset/column）                                                                                                           | `[已有+新增]` VSM（dev / build / Rollup）；MR › maps every dom/ssr expression…、does not attribute dom/ssr runtime helpers to the first source line | `[N/A]`                                                                               | `[N/A]`                                                                                                                                                 |
| Source map：非 JSX 源码段                  | `[N/A]`                                                                                                                                                                             | `[N/A]`                                                                                                                                                                     | `[N/A]`                                                                                                                                                                                                                                       | `[缺陷 C8]`                                                                                                                                         | `[N/A]`                                                                               | `[N/A]`                                                                                                                                                 |
| 诊断码结构与传递                           | `[N/A]`                                                                                                                                                                             | `[N/A]`                                                                                                                                                                     | `[已有+新增]` NC › compiler diagnostics remain structured data；VT › preserves structured compiler diagnostics through Rollup；MD › covers every diagnostic code defined by the Rust compiler（35 个可达码 + 1 个不可达码，DOM/SSR 诊断相同） | `[N/A]`                                                                                                                                             | `[N/A]`                                                                               | `[N/A]`                                                                                                                                                 |
| 非法 / 超深输入不崩溃                      | `[N/A]`                                                                                                                                                                             | `[N/A]`                                                                                                                                                                     | `[缺陷 C3]` MD › returns structured diagnostics for malformed input without throwing、compiles 1000 nested elements without crashing the host process 已覆盖；深度 ≥ 4000 进程崩溃                                                            | `[N/A]`                                                                                                                                             | `[N/A]`                                                                               | `[N/A]`                                                                                                                                                 |
| Hydration plan 回连与稳定 ID               | `[N/A]`                                                                                                                                                                             | `[N/A]`                                                                                                                                                                     | `[N/A]`                                                                                                                                                                                                                                       | `[N/A]`                                                                                                                                             | `[新增]` MR › reconnects every planned binding to server HTML without replacing nodes | `[已有+新增]` CC；NC；RT；MR › assigns stable IDs that do not depend on the target or repeated compiles                                                 |
| Hydration：动态文本边界                    | `[N/A]`                                                                                                                                                                             | `[缺陷 C7]`                                                                                                                                                                 | `[N/A]`                                                                                                                                                                                                                                       | `[N/A]`                                                                                                                                             | `[缺陷 C7]`                                                                           | `[缺陷 C7]`                                                                                                                                             |
| SSR 不读取 `document` / `window`           | `[N/A]`                                                                                                                                                                             | `[已有+新增]` NI › …through SSR without DOM globals；VSE（代码不含 DOM 全局）；MR（每个 SSR fixture 在移除全部 DOM 全局后执行）                                             | `[N/A]`                                                                                                                                                                                                                                       | `[N/A]`                                                                                                                                             | `[N/A]`                                                                               | `[N/A]`                                                                                                                                                 |

非目标：HMR 分类与状态保留（`packages/devtools/vite-plugin/__tests__/hmr.spec.ts`，归 PR-18）、增量缓存（PR-07）、
WASM parity（PR-08）不在本矩阵内。

## 诊断码清单

`MD › covers every diagnostic code defined by the Rust compiler` 扫描 `crates/zeus_compiler/src/*.rs` 中全部
`"ZEUS_*"` 字面量，与测试表逐一比对；`MD › documents every Rust diagnostic code in the semantic matrix` 要求本节列出每个码。
新增码而不更新测试或本文会导致测试失败。

| 诊断码                                          | Rust 触发位置                                                    | 测试（MD 之外）                | 其他文档            |
| ----------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ | ------------------- |
| `ZEUS_ASYNC_COMPONENT`                          | `lower.rs` `report_async_components`（C6）                       | RL                             | —                   |
| `ZEUS_EMPTY_EXPRESSION`                         | `lower.rs:1042`、`1280`、`1628`、`1722`、`1814`                  | RL                             | —                   |
| `ZEUS_FUNCTION_ATTRIBUTE`                       | `lower.rs:1852`                                                  | —                              | RFC-008（未写码名） |
| `ZEUS_FUNCTION_BUILTIN_VALUE`                   | `lower.rs:1220`、`1305`                                          | RL                             | RFC-008             |
| `ZEUS_FUNCTION_CHILD`                           | `lower.rs:1984`                                                  | RT、NC                         | RFC-008（未写码名） |
| `ZEUS_INVALID_BUILTIN_USAGE`                    | `lower.rs:1087`、`1102`、`1109`、`1263`、`1272`                  | RL                             | RFC-008             |
| `ZEUS_INVALID_EVENT_BINDING`                    | `lower.rs` `lower_attribute`、`lower_expression_attribute`（Q2） | RL                             | guide/jsx           |
| `ZEUS_INVALID_ERROR_BOUNDARY_FALLBACK`          | `lower.rs:733`、`823`                                            | —                              | —                   |
| `ZEUS_INVALID_FOR_CHILD`                        | `lower.rs:949`                                                   | —                              | —                   |
| `ZEUS_INVALID_HOST_USAGE`                       | `lower.rs:394`、`1518`                                           | RL、VT                         | —                   |
| `ZEUS_INVALID_ONCE_INTRINSIC`                   | `lower.rs:1829`、`1953`、`2173`                                  | RL                             | RFC-013             |
| `ZEUS_INVALID_ONCE_TARGET`                      | `lower.rs:2165`、`2182`                                          | RL、RT、NC                     | RFC-013             |
| `ZEUS_INVALID_PROPERTY_BINDING`                 | `lower.rs:1730`、`1755`                                          | RL                             | —                   |
| `ZEUS_INVALID_REF_USAGE`                        | `lower.rs:1747`                                                  | RL                             | —                   |
| `ZEUS_INVALID_SHOW_FALLBACK`                    | `lower.rs:1211`                                                  | —                              | —                   |
| `ZEUS_INVALID_SLOT_NAME`                        | `lower.rs:638`                                                   | RL                             | RFC-008             |
| `ZEUS_INVALID_SLOT_USAGE`                       | `lower.rs:403`、`1527`                                           | RL                             | —                   |
| `ZEUS_INPUT_TOO_DEEP`                           | `compiler-native/src/lib.rs`（N-API 输入预检，C3）               | NC                             | compiler API        |
| `ZEUS_MIXED_RAW_TEXT_BINDING_MODE`              | `lower.rs:563`                                                   | RL                             | —                   |
| `ZEUS_PARSE_ERROR`                              | `lower.rs:82`（Oxc 解析诊断）                                    | RL                             | —                   |
| `ZEUS_SEMANTIC_ERROR`                           | `lower.rs:95`（Oxc 语义诊断）                                    | —                              | —                   |
| `ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED`           | `lib.rs:131`（仅 SSR target）                                    | —                              | —                   |
| `ZEUS_UNSAFE_HTML_PROPERTY`                     | `lower.rs` `lower_attribute_name`（Q1）                          | RL                             | guide/SSR、RFC-004  |
| `ZEUS_UNSUPPORTED_ARRAY_MAP_CALLBACK_PARAMETER` | `lower.rs:1470`、`1478`                                          | RL                             | —                   |
| `ZEUS_UNSUPPORTED_ARRAY_SPREAD`                 | `lower.rs:1406`                                                  | RL                             | —                   |
| `ZEUS_UNSUPPORTED_ASYNC_EXPRESSION`             | `lower.rs` `report_async_expressions`（C6）                      | RL                             | —                   |
| `ZEUS_UNSUPPORTED_BUILTIN_SPREAD`               | `lower.rs:598`、`717`、`1013`、`2150`                            | —（RL 只断言有诊断，不断言码） | —                   |
| `ZEUS_UNSUPPORTED_COMPONENT_NAME`               | `lower.rs:1577`                                                  | —                              | —                   |
| `ZEUS_UNSUPPORTED_COMPONENT_PROP_NAMESPACE`     | `lower.rs:613`                                                   | RL                             | —                   |
| `ZEUS_UNSUPPORTED_DOCUMENT_ELEMENT`             | `lower.rs:497`                                                   | RL                             | —                   |
| `ZEUS_UNSUPPORTED_FOR_CALLBACK_PARAMETER`       | `lower.rs:2032`                                                  | RL、RT                         | —                   |
| `ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE`          | `lower.rs:1033`、`1054`、`1296`、`1640`、`1650`、`1777`、`1839`  | RL                             | —                   |
| `ZEUS_UNSUPPORTED_NAMESPACED_ATTRIBUTE`         | `lower.rs:1796`                                                  | RL                             | —                   |
| `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION`        | `lower.rs:1336`、`1354`、`1426`、`1461`、`1486`、`1702`、`1972`  | RL                             | baseline-2026-10    |
| `ZEUS_UNSUPPORTED_RAW_TEXT_CHILD`               | `lower.rs:489`、`537`                                            | RL                             | guide/SSR、RFC-004  |
| `ZEUS_UNSUPPORTED_RAW_TEXT_ELEMENT`             | `lower.rs:474`                                                   | —                              | —                   |
| `ZEUS_UNSUPPORTED_SOURCE_TYPE`                  | `lower.rs:64`（无 span）                                         | —                              | —                   |
| `ZEUS_UNSUPPORTED_SPREAD_CHILD`                 | `lower.rs:2010`                                                  | —                              | —                   |
| `ZEUS_UNSUPPORTED_SSR_PROPERTY`                 | `ssr.rs` `validate_ssr_properties`（仅 SSR target，C5）          | RT                             | guide/SSR、RFC-004  |
| `ZEUS_UNSUPPORTED_TEMPLATE_ELEMENT`             | `lower.rs:505`                                                   | RL                             | —                   |
| `ZEUS_UNSUPPORTED_VOID_ELEMENT_CHILDREN`        | `lower.rs:513`                                                   | RL                             | —                   |

行号基于 `d853352`；2026-10-31 新增的码以函数名定位。`lower.rs` 中经 `unsupported()` 报告的码各自带有
专属 hint（C10），`MD › gives each diagnostic code its own actionable hint` 防止多个码共用同一 hint。
文档此前写的 `ZEUS_UNSUPPORTED_SSR_RAW_TEXT_CHILD` 已改为实现中的 `ZEUS_UNSUPPORTED_RAW_TEXT_CHILD`（C9）。

## 缺陷修复状态

| 缺陷 | 状态                                                                                                        | 提交             | 回归测试                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| C1   | 已修复：SSR 静态文本编译期转义                                                                              | `86e6244`        | RT › escapes_ssr_static_text_and_keeps_rcdata_free_of_hydration_markers；NI › escapes static SSR text…             |
| C2   | 已修复：`textarea` / `title` 内动态文本经 `ssrText` 转义且不写标记                                          | `86e6244`        | 同上                                                                                                               |
| C3   | 已修复：N-API 在 64 MiB 栈线程编译；预检按实测算出的栈开销加权，预算等价 8,192 层 JSX；无分号换行也结束语句 | `832d53a`        | NC › every construct that aborts the worker stack…；NC › deep constructs split across lines…                       |
| C4   | 已修复：非冒泡事件与 `delegateEvents: false` 直接绑定；文档委托跳过直接 handler                             | `86e6244`        | RT › binds_non_bubbling_and_non_delegated_events_directly；NI › binds non-bubbling…；runtime-dom events.spec       |
| C5   | 已修复：原生元素报 `ZEUS_UNSUPPORTED_SSR_PROPERTY`；自定义元素的 `prop:*` 在 SSR 中省略                     | `33c4611` 及本次 | RT › rejects_ssr_properties_without_an_html_equivalent、omits_custom_element_properties_from_ssr；runtime-ssr spec |
| C6   | 已修复：`ZEUS_UNSUPPORTED_ASYNC_EXPRESSION`、`ZEUS_ASYNC_COMPONENT`                                         | `9d0f687`        | RL › rejects_await_and_yield…、rejects_async_and_generator_components、allows_jsx_created_after_await…             |
| C7   | 已修复：动态文本后写 `<!--zeus:hydrate:/-->`，hydrate 为空串补文本节点                                      | `33c4611`        | runtime-dom hydration.spec；NI › SSR text hydrates empty values…；MR parity                                        |
| C8   | 已修复：原样复制的源码逐行、逐标识符映射；生成代码以无源段结束                                              | `33c4611` 及本次 | RT › maps_verbatim_source_outside_jsx_for_dom_and_ssr；MR › does not attribute … runtime helpers                   |
| C9   | 已修复：文档改为与实现一致（仅文本与标量表达式）                                                            | 本次             | MD › ZEUS_UNSUPPORTED_RAW_TEXT_CHILD                                                                               |
| C10  | 已修复：`unsupported()` 按诊断码给出 hint                                                                   | 本次             | MD › gives each diagnostic code its own actionable hint                                                            |
| C11  | 已修复：删除不可达的 `ZEUS_UNSUPPORTED_COMPONENT`                                                           | `9d0f687`        | MD › covers every diagnostic code                                                                                  |
| C12  | 已修复：`<A-b />` 报 `ZEUS_UNSUPPORTED_COMPONENT_NAME`                                                      | `9d0f687`        | RL › rejects_hyphenated_component_names                                                                            |

## 已确认的编译器缺陷（发现记录）

以下缺陷均由本环境的 native 二进制复现。因为无法重建二进制，没有提交失败测试；修复后应把对应格子补成测试。行号基于 `d853352`。

### C1（高）SSR 静态 JSX 文本不转义

- 输入：`export const App = () => <p>&lt;script&gt;1&lt;/script&gt;</p>`，以及
  `<textarea>a &lt;/textarea&gt;&lt;i&gt;x&lt;/i&gt;</textarea>`。
- 实际：SSR 输出 `$zeusSsrStatic("<script>1</script>")`，`renderToString` 产生 `<p><script>1</script></p>`，
  浏览器解析出一个 `<script>` 元素；textarea 用例产生 `<textarea>a </textarea><i>x</i></textarea>`，提前闭合。
  DOM target 的模板为 `<p>&lt;script&gt;…</p>`，渲染为文本。两个 target 的结果不同。
- 期望：静态文本在 SSR 中与 DOM 模板同样转义（`&`、`<`、`>`），输出 `<p>&lt;script&gt;1&lt;/script&gt;</p>`。
- 位置：`crates/zeus_compiler/src/codegen.rs:528-536`（`emit_ssr_child` 的 `ChildIr::Text` 非 raw-text 分支直接
  `quote_js(&text.value)`）。lowering 在 `lower.rs:1926` 已解码实体，DOM 模板在 `codegen.rs:2268` 调用
  `escape_html_text`，SSR 分支缺少同样的调用。RFC-004“静态 JSX 文本沿用 lowering 阶段已有的转义结果”与实现不符。

### C2（高）`textarea` / `title` 的 SSR 输出在 RCDATA 内写入 hydration 注释

- 输入：`export const App = props => <main><textarea>{props.a}</textarea><title>x {props.b}</title></main>`，
  `a = 'hello'`。
- 实际：HTML 为 `<textarea><!--zeus:hydrate:c1.t4-->hello</textarea>`，解析后 `textarea.value` 为
  `"<!--zeus:hydrate:c1.t4-->hello"`；`title` 同样包含注释文本。hydration plan 只有 `c1.root`、`c1.e2`、`c1.e3`、
  `c1.e5`，不含 `c1.t4` / `c1.t7`，即 SSR 写出了计划之外的标记。
- 期望：`<textarea>hello</textarea>`，RCDATA 元素内不写标记，与 plan 一致。
- 位置：`codegen.rs:772` 用 `is_unescaped_raw_text`（只含 script/style，`codegen.rs:2456`）决定 raw-text 模式，
  `codegen.rs:538-552` 因而为 textarea/title 的动态文本写标记；`hydration.rs:219` 用 `is_raw_text_element`
  （含 textarea/title）跳过这些文本节点。两处判定需统一。

### C3（高）深层嵌套输入导致宿主进程 SIGSEGV

- 输入：`'export const App = () => ' + '<b>'.repeat(4000) + 'x' + '</b>'.repeat(4000)`；或文件名 `App.ts`、
  源码 `'export const x = ' + '('.repeat(5000) + '1' + ')'.repeat(5000)`（无 JSX）。
- 实际：Node 24.18、macOS arm64 主线程上 `transformModule` 使进程以 139 退出（SIGSEGV），无 JS 异常、无诊断。
  深度 3000 正常；在 `stackSizeMb: 64` 的 Worker 中深度 5000 正常，说明是栈溢出。
- 期望：返回结构化诊断（例如超出嵌套上限）或在足够大的栈上完成；不得终止 Vite / CLI / Playground 宿主。
- 位置：无 JSX 的 `.ts` 也崩溃，发生在 Oxc 解析 / 语义阶段，入口为 `lower.rs:73`（`Parser::parse`）与
  `lower.rs:88`（`SemanticBuilder::build`）；N-API 入口 `packages/core/compiler-native/src/lib.rs:106` 的
  `catch_unwind` 无法捕获栈溢出。可选修复：在 `lib.rs` 中用 `std::thread::Builder::stack_size` 在专用线程上执行
  transform，并在 lowering 加嵌套深度诊断。

### C4（高）事件委托：`delegateEvents: false` 时事件不触发；非冒泡事件被委托

- 输入：`export const App = h => <button onClick={h}>x</button>`，`delegateEvents: false`；以及
  `delegateEvents: true` 下的 `<img onLoad={h} />`、`<div onMouseEnter={h} />`、`<z-v onToggle={h} />`
  （派发不冒泡的 `toggle` CustomEvent）。
- 实际：JSDOM 中（每例前 `resetDelegatedEvents()`），四个用例的 handler 调用次数都是 0。
  `delegateEvents: false` 仍生成 `bindEvent`，而 runtime 的 `bindEvent` 只在元素上登记 handler 供委托使用；
  `delegateEvents: true` 时 `load`、`mouseenter`、`toggle` 也被加入 `$zeusDelegateEvents([...])`，但这些事件不冒泡到
  `document`。作为对照，`delegateEvents: true` 的 `click` 调用 1 次。
- 期望：关闭委托时直接 `addEventListener`；不冒泡的事件（`load`、`error`、`mouseenter`、`mouseleave`、`scroll`、
  media 事件，以及不冒泡的 CE 事件）不经 document 委托。
- 位置：`codegen.rs:1182-1190`（`emit_event_binding` 不区分委托开关）、`codegen.rs:2508-2514`
  （`collect_element_delegated_events` 收集所有事件名）；runtime 侧 `packages/core/runtime-dom/src/events.ts:17-20`
  只映射 focus/blur，`events.ts:22-54` 仅在 closed shadow root 中直接监听。
  `docs/api/vite-plugin.md:87` 公开了 `delegateEvents` 选项。

### C5（中）SSR 不可序列化的 `prop:` 没有编译期诊断

- 输入（SSR target）：`<div prop:textContent={props.a} />`、`<select prop:value={props.a} />`（字符串值）、
  `<z-card prop:model={props.m} />`（对象值）。
- 实际：编译无诊断；`renderToString` 分别抛出 `SSR cannot serialize property "textContent".`、
  `SSR cannot serialize property "value" on <select>.`、`SSR cannot serialize property "model".`。任何在 SSR 中渲染
  带对象 property 的 Custom Element 的页面都会在请求时失败。
- 期望：按 `docs/guide/server-rendering.md:110-114` 与 RFC-004:83-84，在编译期报告带 span 的
  `ZEUS_UNSUPPORTED_SSR_PROPERTY`；CE 对象 property 是否改为在服务端省略需要裁决（参照 WC wrapper SSR-0 规则）。
- 位置：`codegen.rs:749-760` 对所有 `AttributeIr::Property` 无条件生成 `ssrProp`；白名单只存在于
  `packages/core/runtime-ssr/src/property.ts`。

### C6（中）`async` / `await` / `yield` 没有诊断，DOM 输出非法

- 输入：`export const App = async props => <div>{await props.a}</div>`；生成器中的 `{yield 1}` 同理。
- 实际：两个 target 均无诊断。DOM 输出把表达式放进非 async 的 getter `() => (await props.a)`，模块加载时报
  `SyntaxError: Unexpected reserved word`（`yield` 为 `Unexpected strict mode reserved word`）；SSR 输出可加载，
  运行时 `renderToString` 抛出 async 错误。不含 `await` 的 async 组件同样无诊断，由两个 runtime 拒绝 Promise
  （MR 已覆盖）。
- 期望：设计包矩阵要求的 “async unsupported diagnostics”：对 async 组件 setup 与 JSX 表达式中的
  `await` / `yield` 报告带 span 的编译期诊断。`ErrorBoundary` fallback 已有同类检查（`lower.rs:784`）。
- 位置：`lower.rs:2041`（`lower_expression` 接受任意表达式）；DOM getter 包装在 `codegen.rs:1993`（文本）及其他
  `"() => ("` 包装点。

### C7（中）SSR 动态文本缺少边界，hydration 无法回连空串或相邻静态文本

- 输入：`export const App = props => <p>{props.a}</p>`，`a = ''`；
  `export const App = props => <p>{props.a} world {props.b}</p>`，`a = 'A'`、`b = 'B'`。
- 实际：第一例 HTML 为 `<p><!--zeus:hydrate:c1.t3--></p>`，`hydratePlan` 的 text handler 抛出
  `ZEUS_HYDRATION_TARGET_MISSING: c1.t3`。第二例 HTML 为 `<!--…t3-->A world <!--…t5-->B`，解析后 `A world `
  是一个文本节点，把 t3 绑定为 `A2` 后 `textContent` 为 `"A2B2"`，静态文本 `world` 丢失。
- 期望：分别得到可绑定的空文本和 `"A2 world B2"`。SSR 需要在动态文本后写结束边界（或空文本占位），
  runtime 在边界内定位或创建文本节点。
- 位置：`codegen.rs:538-552`（只写开始标记）；`packages/core/runtime-dom/src/hydration.ts:296-300`
  （`nextHydratableNode` 取标记后的第一个非注释节点）。

### C8（中）非 JSX 源码段没有 source map 映射

- 输入：`const helper = (n: number) => n * 2` / `export const App = props => <p>{helper(props.n)}</p>` /
  `export const tail = 1`（三行）。
- 实际：JSX 表达式 `helper(props.n)` 映射正确（2:32）；`const helper`（DOM 生成第 3 行，SSR 第 2 行）与
  `export const tail`（DOM 第 11 行）映射为 `null`。生成代码在模块顶部插入 import 与模板，非 JSX 代码的行号整体偏移，
  这些函数中的异常栈和断点无法回到原始行。
- 期望：原样复制的源码段按原始行列映射。RFC-005 §5 只允许生成的 helper / template / 锚点无映射。
- 位置：`codegen.rs:266-290`（`push_source_range` 用 `writer.push` 复制源码，不记录 mapping）；
  `codegen.rs:2804` 构建 map 时只有 `push_mapped` 产生的映射。

### C9（低）文档与编译器的 raw-text 规则不一致

- `docs/guide/server-rendering.md:91-94` 与 RFC-004:66-68 写的是 raw-text 元素接受 Fragment、`Show`、`For`，
  其他子节点报 `ZEUS_UNSUPPORTED_SSR_RAW_TEXT_CHILD`。
- 实际：`<script><>{props.a}</></script>`、`<style><Show …>…</Show></style>`、`<script><For …/></script>`
  在 DOM 与 SSR 都报 `ZEUS_UNSUPPORTED_RAW_TEXT_CHILD`（`lower.rs:480-492` 拒绝 Element / Fragment / Spread 子节点，
  `lower.rs:533-540` 拒绝非标量动态区域）。需要裁决以文档还是实现为准，并统一诊断码名称。

### C10（低）诊断 hint 不可操作

- `lower.rs:2017-2027` 的 `unsupported()` 为所有经它产生的诊断（约 30 个码）附加同一个 hint
  `Use a native element with static attributes and dynamic text.`，例如 `ZEUS_INVALID_SHOW_FALLBACK`、
  `ZEUS_INVALID_FOR_CHILD`、`ZEUS_UNSUPPORTED_RAW_TEXT_ELEMENT`。PR-06 要求 actionable hints。
  `ZEUS_UNSUPPORTED_FOR_CALLBACK_PARAMETER`（`lower.rs:2029-2039`）与 once 相关诊断已有专属 hint，可作为模式。

### C11（低）`ZEUS_UNSUPPORTED_COMPONENT` 不可达

- `lower.rs:438-445` 只在元素名不是 `Identifier` 时报告该码，但 `is_component_element`（`lower.rs:2820-2830`）
  已把所有非 `Identifier` 名称归为组件，`<svg:rect />` 实际报 `ZEUS_UNSUPPORTED_COMPONENT_NAME`。
  按 AGENTS.md 2.6 应删除该分支与码。

### C12（低）大写开头的连字符标签生成非法组件调用

- 输入：`const A = () => null` / `export const App = () => <A-b x={1} />`。
- 实际：无诊断，生成 `$zeusCreateComponent(A-b, {x: 1})`，即减法表达式。
- 期望：报告非法组件名诊断。
- 位置：`lower.rs:2820-2826`（首字母大写即判为组件）与 `lower.rs:1567-1573`（直接用标签名作为 JS 代码）。

## 已裁决语义（2026-10-31）

- Q1：`prop:innerHTML` 与 `prop:outerHTML` 在两个 target 上报 `ZEUS_UNSAFE_HTML_PROPERTY`。可信且已净化的 HTML
  在 `ref` 回调中显式赋值。与 RFC-008 对 Spread 的限制一致。
- Q2：`onName` 继续绑定小写的 DOM 事件；新增 `on:name` 按原样绑定事件名（如 Zeus CE 的 `value-change`）。
  含 `-` 或大写字母的事件名一律直接绑定在元素上，不进入文档委托；`on-x` 报 `ZEUS_INVALID_EVENT_BINDING`。
- 自定义元素上的 `prop:*` 在 SSR 中省略（与 Wrapper SSR-0 一致），由升级或 hydration 后设置。

## 原待裁决语义（记录）

- Q1 `prop:innerHTML`：DOM target 无诊断，直接写入 HTML（`<img src=x onerror=…>` 会被解析并执行）；SSR 运行时
  抛错；RFC-008 规定 Spread 拒绝 `innerHTML`、`outerHTML`、`textContent`、`children`，显式 `prop:` 却放行。
  需要决定是否要求显式的 unsafe API 或在编译期拒绝。
- Q2 CE 事件命名：`onValueChange` 降为 `valuechange`，而 Zeus CE 按 RFC-010 派发 `value-change`；
  `onvalue-change` 得到 `value-change`，`on-value-change` 得到 `-value-change`（`lower.rs:1882`）。需要定义
  Native TSX 消费 kebab-case CE 事件的写法。

## 后续

- 可联网环境：修复 C1–C8，重建 `compiler-native`，把对应 `[缺陷]` 格子补成 MR / MD 测试，并运行
  `cargo test --workspace --locked` 与 `pnpm test:compiler-native`。
- 剩余 `[GAP]`：CE / Host-Slot / ref / SVG / Transition / ErrorBoundary 的 source map；Transition 的 DOM/SSR
  parity；ErrorBoundary 编译输出的 JSDOM 执行；真实浏览器三引擎（BLOCKED）。
