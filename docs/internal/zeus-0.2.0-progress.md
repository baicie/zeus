# Zeus 0.2.0 进度台账

依据：Zeus 0.2.0 Full-Platform Design Kit v1.0（37 个 PR 切片，M0–M7）。工作分支：
`codex/zeus-0.2.0-progress`（基于 `main@d853352`，未推送、无 PR）。本表只记录本仓库 `zeus`
的切片；`zeus-ui` 的 PR-02/24/25/26/32/33/35/37 在该仓库另行跟踪。

状态：`完成` 有代码与测试证据；`部分` 已交付的范围写在备注；`未开始`；`阻塞` 写明原因。

## 切片状态（2026-11-01）

| PR               | 主题                      | 状态   | 证据 / 备注                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR-01            | Core/WebC 基线            | 部分   | `docs/internal/m0-baseline-2026-10-29.md`；CI、npm、浏览器、人工架构审查当时为 BLOCKED                                                                                                                                                                                                                             |
| PR-03            | Vue Reactivity 上游账本   | 完成   | `docs/adr/reactivity-upstream-ledger.md`、LICENSE 审计；上游 commit SHA 需联网补齐                                                                                                                                                                                                                                 |
| PR-04            | Signal 正确性             | 完成   | scope/watch/scheduler/set trap 四项修复与回归测试                                                                                                                                                                                                                                                                  |
| PR-05            | Owner/Cleanup 与诊断      | 部分   | cleanup 抛错仍释放 DOM、owner/binding/listener 诊断计数；三引擎断开后 listener cleanup 已验收；GC 级证据未做                                                                                                                                                                                                       |
| PR-06            | 编译器语义矩阵            | 完成   | `docs/internal/compiler-semantic-matrix.md`；C1–C12 全部修复，Q1/Q2 已裁决；C3 预检上限按实测栈深度定为 8,192（`791713a`）                                                                                                                                                                                         |
| PR-07            | 编译器增量缓存            | 部分   | Vite 插件缓存与失效已实现；`pnpm bench:compiler-cache` 记录 cold/warm/changed 与 5,000 entries 内存数据，未设性能阈值                                                                                                                                                                                              |
| PR-08            | Rust WASM 编译器          | 完成   | `docs/internal/wasm-compiler-2026-10-31.md`；225 次 transform 与 native 一致；三引擎 Worker 通过；包暂为 private                                                                                                                                                                                                   |
| PR-09            | WebC ABI/Manifest 版本化  | 完成   | attribute/event/slot/method 单一来源、loader ABI 标记、Manifest 诊断与跨产物一致性测试；`56c6191`                                                                                                                                                                                                                  |
| PR-10            | CE Lifecycle/Props/Form   | 部分   | adopted 生命周期、属性/反射/表单回调、RFC-010 全部构建诊断；CE 反复挂载诊断计数归零；三引擎验收 FormData/disabled/reset/labels，packed 覆盖 validity 与 stateRestore（`docs/internal/m2-browser-evidence-2026-11-01.md`）；IME 无法跨引擎自动化，无证据                                                            |
| PR-11            | Shadow/Light/Slots/Styles | 部分   | packed 证据覆盖 slot projection、focus/selection、styles 与 nonce、parts/vars、CSP、重连不重复样式；三引擎 ARIA 树一致且 1×/2×/200% 缩放无裁剪（`docs/internal/m2-browser-evidence-2026-11-01.md`）；嵌套 overlay 焦点属 zeus-ui 未覆盖                                                                            |
| PR-12            | Standalone/Lazy 输出      | 部分   | lazy 输出、chunk 失败重连重试、输出插件契约与仓库外第三方 Output Target；四类真实消费者 bundle 中未使用组件均被 tree-shake，初始/全部 JS 基线已记录（`docs/internal/m2-browser-evidence-2026-11-01.md`）；未设体积阈值                                                                                             |
| PR-13            | React 18/19 Wrapper       | 完成   | packed React 18 与 React 19 消费者：SSR、类型、构建、bundle 与三引擎浏览器用例本地全部通过（`docs/internal/m2-browser-evidence-2026-11-01.md`）                                                                                                                                                                    |
| PR-14            | Vue 3 Wrapper             | 完成   | packed Vue 3 消费者：SSR、类型、构建、bundle 与三引擎浏览器用例本地全部通过（`docs/internal/m2-browser-evidence-2026-11-01.md`）                                                                                                                                                                                   |
| PR-15            | 跨框架 Renderer Host      | 部分   | `@zeus-js/web-c-runtime` 导出 `createRendererHost`（generation + AbortSignal）；`output-react-wrapper/renderer`、`output-vue-wrapper/renderer` 提供 React/Vue adapter，jsdom 覆盖 StrictMode、Portal/Teleport、错误清理与 60 次挂载回基线；三引擎、host 重连与 DataGrid `cellRenderer` 未做，RFC-011 仍为 Proposal |
| PR-16            | SSR/DSD 与实验性流式 SSR  | 进行中 | 独立会话，分支 `codex/pr16-ssr-dsd`                                                                                                                                                                                                                                                                                |
| PR-17–18, 20–23  | M3/M4                     | 未开始 | PR-17 依赖 PR-16；PR-18 依赖 PR-17                                                                                                                                                                                                                                                                                 |
| PR-19            | Router/Query 声明式 SDK   | 进行中 | 独立会话，分支 `codex/pr19-app-sdk`                                                                                                                                                                                                                                                                                |
| PR-27–31, 34, 36 | M6/M7                     | 未开始 | PR-27 将消费 `@zeus-js/compiler-wasm`                                                                                                                                                                                                                                                                              |

## 已裁决事项

| 事项                                | 决定                                                                                                              | 记录位置                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 兼容政策（ADR-10 vs AGENTS.md 2.6） | beta 阶段不保留兼容层；不兼容时构建期显式失败，迁移方式为用匹配版本重新构建                                       | RFC-010 §1.2                             |
| ABI 版本字段（ADR-02 vs RFC-010）   | Manifest 只保留 `schemaVersion: 1`；运行时 loader 契约用导出名 `ZEUS_WC_RUNTIME_ABI_1` 表达                       | RFC-010 §1.2                             |
| 自定义元素 `prop:*` 的 SSR          | 省略，由升级或 hydration 设置；原生元素仍报 `ZEUS_UNSUPPORTED_SSR_PROPERTY`                                       | server-rendering.md、RFC-004             |
| `prop:innerHTML` / `outerHTML`      | 两个 target 编译期报 `ZEUS_UNSAFE_HTML_PROPERTY`                                                                  | server-rendering.md、RFC-004             |
| CE 事件命名                         | 新增 `on:name` 按原名绑定；含 `-` 或大写的事件直接绑定；`on-x` 报错                                               | guide/jsx.md                             |
| raw-text 子节点规则                 | 文档按实现：仅文本与标量表达式                                                                                    | server-rendering.md、RFC-004             |
| WASM 宿主形态                       | `wasm32-unknown-unknown` + 线性内存 JSON ABI，不用 wasm-bindgen/WASI；2 MiB shadow stack                          | wasm-compiler-2026-10-31.md              |
| 输出插件契约                        | `apiVersion: 1` 必填；第三方 kind 用 `vendor:name` 并显式 `outDir`；同 kind 或同文件冲突报 `ZEUS_OUTPUT_CONFLICT` | compiler-host/bundler-plugin.md          |
| 编译嵌套上限                        | N-API 预检上限 8,192 层（64 MiB 栈下各语法 12,288 层实测可编译）；WASM 由引擎栈约束于约 1,400 层且可恢复          | compiler.md、wasm-compiler-2026-10-31.md |

## 未决与阻塞

- Streaming SSR 与自动 Hydration（PR-16/17）与 RFC-004 的非目标冲突，开工前需先修订 RFC-004。
- 推送分支、创建 Draft PR、npm 发布与部署均未获授权。
- 本机 `cargo` 依赖经 USTC 镜像下载（`~/.cargo/config.toml`），CI 使用官方源。
