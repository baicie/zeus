# PR-16 · SSR/DSD 序列化与集成加固 — 验收证据（2026-11-01）

## A. Baseline

| 项             | 值                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Repository     | `/Users/liuzhiwei/Desktop/workspace/git-code/zeus`（worktree `temp/worktrees/pr16-ssr`）              |
| Branch         | `codex/pr16-ssr-dsd`                                                                                  |
| Base           | `cff2721b581f0f370bb70a2f2871c0a667897cfe`（`codex/zeus-0.2.0-progress` 集成点 `adf88de`，未 rebase） |
| Start HEAD     | `cff2721b581f0f370bb70a2f2871c0a667897cfe`                                                            |
| Final HEAD     | `docs(ssr)` 提交，见 §E 提交清单最后一条                                                              |
| Diffstat       | 37 files changed, 3018 insertions(+), 100 deletions(-)（含 intent-to-add）                            |
| 工作树是否干净 | 提交后干净；提交前仅本切片的改动                                                                      |

已存在工作与复用：PR-06/09/10/11 已在集成分支提供 SSR 运行时、显式 hydration 计划、
Web Component 契约与表单关联基线，本切片不重做这些模块，只补缺、加固并新增实验性流式入口。
同一工作树内另有 `codex/fix-webc-review`、`codex/fix-runtime-review` 并行修改
`packages/core/runtime-dom/src/defineElement.ts`；本切片只改挂载/投影/样式顺序相关代码（见 §B.3）。

## B. Changes

### B.1 变更文件

编译器中轴（同一条 Rust lowering/IR，产出 DOM 与 SSR 两个 codegen target）：

- `crates/zeus_compiler/src/ir.rs` — `ElementIr.namespace: String`（`"html"`/`"svg"`，serde 默认 `"html"`）。
- `crates/zeus_compiler/src/html.rs` — `element_namespace()` / `content_namespace()` 两条规则：`<svg>` 进入 SVG；`<foreignObject>` 自身是 SVG，其子节点回到 HTML。
- `crates/zeus_compiler/src/lower.rs` — 命名空间沿树传播（含控制流子树）；`LowerResult.ssr_runtime_imports` 由 `Vec<Span>` 改为 `Vec<SsrImportRewrite>`，新增 `SsrImportRewrite` / `SsrImportReplacement` 与逐 specifier 的 import 拆分。
- `crates/zeus_compiler/src/codegen.rs` — SSR import 重写支持 façade/client 拆分；SVG `<script>`/`<style>` 走 `ForeignRaw`（静态与动态文本都转义，`ssrElement(..., undefined, true)`）；DOM 模板侧同名元素保持原始模板文本。
- `crates/zeus_compiler/src/ssr.rs` — `defaultValue` / `defaultChecked` 与 `value` 同策略可序列化。

运行时（`@zeus-js/runtime-ssr`）：

- 新增 `streaming.ts`（`renderToStream`、`SSR_STREAMING_API_VERSION = 1`）、`context.ts`（`createSSROwner` 等 owner API、`createContext/useContext/provide/inject`）、`schema.ts`（服务端 `prop()`/`event()`）、`components.ts`。
- `serialize.ts` 新增 `serializeSSRNodeChunks()` 与 `serializeSSRForeignText()`；`element.ts` 增加 `rawText` 参数；`property.ts` 增加 `defaultValue`/`defaultChecked` 与 nullish 清空；`controlFlow.ts`、`spread.ts` 补齐 thenable 拒绝；`webComponent.ts` 输出 Light DOM 标记与样式顺序。
- `index.ts` 扩充公开导出；`@zeus-js/zeus/server` 同步 façade。

DOM 升级侧：

- `packages/core/runtime-dom/src/lightDomSsr.ts`（新，内部模块，不从公开入口导出）— `takeSSRLightDomChildren(host)`。
- `packages/core/runtime-dom/src/defineElement.ts` — 仅 `mountElement()` 与 `mountElementDefinition()` 及它们的样式挂载顺序（见 §B.3）。
- `packages/core/shared/src/lightDomMarkers.ts`（新，内部常量）。

文档与契约：

- `docs/rfcs/RFC-018-streaming-ssr.md`（新）、`RFC-004`（非目标指向 RFC-018）、`RFC-003`（Light DOM 服务端首屏与升级）、`docs/rfcs/README.md`、`docs/guide/server-rendering.md`、`docs/api/runtime-ssr.md`。
- API 快照：`runtime-ssr.main.api.md`、`shared.main.api.md`、`zeus.server.api.md`。
- `.changeset/ssr-streaming-and-dsd-hardening.md`。

### B.2 公开 API / ABI / 类型变化

新增（均为 additive，无移除）：

| 入口                                            | 新增                                                                                                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zeus-js/runtime-ssr` / `@zeus-js/zeus/server` | `renderToStream`、`SSR_STREAMING_API_VERSION`、`serializeSSRNodeChunks`、`Portal`、`Transition`、`createContext`、`useContext`、`provide`、`inject`、`prop`、`event`、`createSSROwner` 等类型 |
| IR / 编译器原生                                 | `ElementIr.namespace`（serde 默认值，旧 IR JSON 仍可反序列化）                                                                                                                                |

兼容风险：beta 阶段按 AGENTS.md §2.6 不保留兼容层；本切片没有删除任何公开 API。
`@zeus-js/shared` 的两个标记常量是内部常量，不进公共文档入口。

非目标：不引入增量 hydration、out-of-order 流、自动组件 hydration、MathML 命名空间、
对对象/数组做 attribute JSON 序列化。

### B.3 `defineElement.ts` 改动范围（交回说明）

改动函数只有两个，其余未动：

- `mountElement()`（`defineElement` 返回类的私有挂载方法）：
  - Light DOM 捕获子节点时先尝试 `takeSSRLightDomChildren(this)`，有标记则用投影来源子节点，否则退回 `Array.from(this.childNodes)`；
  - `mountStyles()` 提前到 `renderWithPreservedNodes()` 之前，并把 `styleNodes` 作为保留节点排在内容之前。
- `mountElementDefinition()`：同上两条（`host` / `mountState.lightChildren`）。

未触碰：`normalizePropDefinitions`、`attributeChangedCallback`、`disposeMountedElement`。
新增内部模块 `lightDomSsr.ts`，未从 `packages/core/runtime-dom/src/index.ts` 导出。

### B.4 按任务逐项判定

| #   | 任务                                                                              | 判定            | 证据 / 缺口                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 现有 RFC-004 SSR/DSD/显式 hydration 用例 + 安全转义/raw text/async rejection 补测 | DONE            | `runtime-ssr.spec.ts`（44 例，含转义、raw text 跨节点、double-escaped、thenable、异步拒绝）；新增 `ssr-hardening.spec.ts`（16 例）；`pnpm check:hydration` 三引擎通过                                                                          |
| 2   | Native/WC DSD/React+Vue 消费边界表，统一 marker 与样式 owner                      | DONE            | `docs/guide/server-rendering.md` 新增 "Renderer Boundary Table"；marker 常量集中在 `@zeus-js/shared`，样式统一“内容之前”                                                                                                                       |
| 3   | 修复 SSR import/global scope、form serialization、portal/slot/DSD 缺口            | DONE            | 逐 specifier import 拆分（`transform.rs` 3 个新用例 + `pnpm check:ssr-safe-import`）；`defaultValue`/`defaultChecked` 序列化（Rust + runtime 双侧用例）；Portal/Transition/context/schema 进入 SSR façade，SSR 模块不再被迫 import DOM runtime |
| 4   | 保留 sync SSR 契约，streaming 另立 versioned RFC                                  | DONE            | `docs/rfcs/RFC-018-streaming-ssr.md`（Proposal/experimental），RFC-004 非目标指向它                                                                                                                                                            |
| 5   | 实验性 streaming：真实分块、取消、背压、异常中断、转义、per-request owner 隔离    | DONE（Node 侧） | `packages/core/runtime-ssr/__tests__/streaming.spec.ts` 19 例；浏览器消费属宿主集成，BLOCKED（见 §C）                                                                                                                                          |
| —   | Node 无 DOM imports                                                               | DONE            | `pnpm check:ssr-safe-import` 通过；`@zeus-js/zeus/server` 无 `document`/`customElements` 依赖                                                                                                                                                  |
| —   | DSD 首屏与 client CE 升级可对照                                                   | PARTIAL         | 服务端顺序（样式在内容前）+ 客户端升级已对齐并有 jsdom 用例（`defineElement.ssr.spec.tsx` 9 例）；**真实浏览器 DSD 解析未验证 → BLOCKED**（jsdom 不解析 `shadowrootmode`，无对应 Playwright 脚本）                                             |
| —   | DOM/SSR 由同一 Rust lowering/IR 生成                                              | DONE            | 同一 `Ir` → `TransformTarget::{Dom,Ssr}`；命名空间用例 `lower.rs`；playground IR fixture 刷新                                                                                                                                                  |

## C. Validation（只记录实际执行）

环境：macOS 26.6（Apple Silicon）、Node `v24.18.0`（`PATH=/Users/liuzhiwei/.nvm/versions/node/v24.18.0/bin:$PATH`）、
`NODE_USE_SYSTEM_CA` 已 unset；Rust toolchain 由 `rust-toolchain.toml` 固定；cargo 全程 `--offline`。

| Command                                               | Environment                               | Result  | Evidence Path                                                                       |
| ----------------------------------------------------- | ----------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `pnpm check`                                          | local                                     | PASS    | `tsc --incremental --noEmit`，exit 0                                                |
| `pnpm lint`                                           | local                                     | PASS    | `eslint --cache .`，exit 0                                                          |
| `pnpm format-check`                                   | local                                     | PASS    | "All matched files use Prettier code style!"                                        |
| `cargo test -p zeus_compiler --offline`               | local                                     | PASS    | 1 + 7 + 52 + 1 + 61 = 122 passed，0 failed                                          |
| `npx vitest --run --project 'unit*' --maxWorkers=2`   | local                                     | PASS    | 167 files / 1839 tests passed（98.20s）                                             |
| `npx vitest --run --project 'unit*' <SSR suites>`     | local                                     | PASS    | 9 files / 140 tests passed（runtime-ssr、defineElement.ssr、server-api、hydration） |
| `pnpm check:ssr-safe-import`                          | local                                     | PASS    | "SSR import and primitive render check passed."                                     |
| `pnpm check:hydration`                                | Chromium 1248 / Firefox 157 / WebKit 27.2 | PASS    | "SSR/explicit hydration passed in Chromium, Firefox and WebKit"                     |
| `pnpm check:cjs`                                      | local                                     | PASS    | 21 packages, 28 exports, 56 conditional loads, 46 wrapper fallbacks                 |
| `pnpm check:exports`                                  | local                                     | PASS    | "Package exports boundary check passed."（需先 `pnpm build-dts`）                   |
| `pnpm api:check`                                      | local                                     | PASS    | "API snapshots are up to date."（快照改动已 staged）                                |
| `pnpm check:runtime-interop`                          | local                                     | PASS    | ESM/CJS/mixed 开发与生产构建                                                        |
| `pnpm check:docs`                                     | local                                     | PASS    | "Choose Zeus guide and local links passed."                                         |
| `pnpm build runtime-ssr zeus shared`                  | local                                     | PASS    | exit 0                                                                              |
| `pnpm --filter @zeus-js/compiler-native build:native` | local                                     | PASS    | Rust 改动后重建原生二进制（21:17:43），早于全部测试                                 |
| 浏览器 DSD / Light DOM 首屏三引擎用例                 | —                                         | BLOCKED | 仓库无对应 Playwright 脚本；jsdom 不解析 `shadowrootmode`                           |
| 流式 SSR 浏览器端消费                                 | —                                         | NOT_RUN | Node 端 `ReadableStream` 由运行时提供；浏览器消费属宿主服务器集成（RFC-018）        |
| `pnpm check:packed-consumers`                         | —                                         | NOT_RUN | 需网络安装 packed tarball，本切片无网络                                             |

补充说明（真实记录，不视为本改动回归）：并行度较高时 `pnpm test-unit` 曾出现 6 个 Web-C 套件
30s 超时（`output-wc`、`output-react-wrapper`、`output-vue-wrapper`、`component-dts` 等，均为临时目录 +
`dts-bundle-generator` + TS program 的重型用例）；以 `--maxWorkers=2` 全量重跑 1839 例全通过，
单独运行这些套件亦通过。基线（`cff2721`）同样存在该负载敏感行为。

## D. Security & Performance

安全：

- **注入面**：所有动态文本经 `escapeHTMLText`，属性经 `escapeHTMLAttribute`；`ssrStatic` 只接受编译器预转义内容。
  SVG 中的 `<script>`/`<style>` 由 `ForeignRaw` 语境处理：静态与动态文本都转义，`ssrElement` 以 `rawText=false`
  关闭 raw-text 通道——修复了“SVG 内 `<style>` 内容被当作 CSS raw text 输出”的注入路径。
- **raw text 结束标签**：`<script>`/`<style>` 在完整子序列拼接后改写匹配结束标签，并处理 script 的
  double-escaped state；跨节点拆分的结束标签用例覆盖。
- **流式**：每个 chunk 走同一转义器；`assertStreamNode` 在序列化前遍历整棵树；raw-text 内 `SSRFragment` 一律拒绝。
- **SSR import 拆分**：SSR 目标不再因一个混合 import 整条语句留在 DOM runtime，从而不会在 Node 进程里
  触发 `document` 访问；`SSR_FACADE_EXPORTS` 白名单限定可迁移符号。

性能：本切片未做 benchmark，也无性能回归证据。流式的成本模型是“每个 `flushAt`（默认 8 KiB）
一次 `enqueue`”，无额外缓冲层；同步路径代码路径未变（`serializeSSRNodeChunks` 是 `renderToString` 内部已有的
生成器，流式只是拉动它）。

## E. Git / PR

- 分支：`codex/pr16-ssr-dsd`（base `cff2721`，未 rebase，由主会话合并）
- 提交（按顺序）：
  - `e66aeb91529edd1d854cd7b2d6b6750d4b93e406` `feat(compiler): record SVG namespaces and split SSR imports per specifier`
  - `93b356583adc6fa4025434c7b5049d9330588c26` `feat(runtime-ssr): add experimental streaming SSR and the missing server facade`
  - `24d15a4e4700eaebe80abfbbc2e858177833b1ca` `fix(runtime-dom): upgrade server-rendered Light DOM hosts from explicit markers`
  - 本报告所在提交（`docs(ssr): …`）为本切片 Final HEAD
- 推送：**未执行**；Draft PR：**未创建**（任务约束明确不 push / 不开 PR / 不合并 / 不发布）
- CI：**NOT_RUN**（无远端）
- 发布：**未执行**

## F. Risks & Follow-up

真实失败与原因：

1. `pnpm check:exports` / `pnpm api:check` 在未构建 `dist` 时会失败（指向缺失 `.d.ts` 或快照漂移）。这是仓库
   既有的构建前置条件，不是本改动引入；执行 `pnpm build-dts` 后两者均通过。若 CI 顺序不同需注意。
2. `pnpm test-unit` 在高并行度下的 Web-C 重型套件超时（见 §C 补充说明）。属于基线既有行为，未在本切片修复。

必须人工执行/确认：

- 真实浏览器 DSD 首屏 + Light DOM 标记升级的三引擎验证（本机无对应脚本；建议后续 slice 增加
  `check:dsd-browser`）。
- 流式 SSR 在真实宿主（Node HTTP / `Response`）中的集成与背压实测。

剩余 TODO / 下一 PR 前置条件：

- 增量 hydration、out-of-order 流仍是非目标，RFC-018 已显式列出。
- `defaultValue`/`defaultChecked` 目前按“等价 attribute”序列化，未实现完整 dirty-value flag 语义。

无证据的假设：

- 假定 `flushAt` 默认 8 KiB 对常见页面是合理折中，未做调参实验。

## G. Stop Decision

**READY_FOR_REVIEW**（Node 侧证据完整；浏览器 DSD 一项 BLOCKED 已明示）。

未涉及 secret、模型费用、正式发布、生产写入或合并；按任务约束未 push、未开 PR、未合并、未发布。
