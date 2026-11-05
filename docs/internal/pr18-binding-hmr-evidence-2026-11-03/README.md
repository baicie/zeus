# PR-18：编译器签名与字符串绑定 HMR 验收

状态：READY_FOR_REVIEW（实验能力已实现并验证）。仓库 `baicie/zeus`，分支
`codex/pr18-binding-patch`，base `fd49536`，工作树位于 `temp/worktrees/pr21-template-registry`。
本报告承接 `cb52cb0` 的注释保留基线，依据设计包 PR-18、ADR-06、G5/G6 补齐实际 TSX patch。

## 交付与设计逐项对应

| 原任务                                          | 当前证据                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| compiler structure/signature 分类与 patch       | DONE；Rust 从 Zeus IR 找 literal text/class/style，签名是其余源码分段、binding ID/类型、runtime/delegation 配置的精确结构化比较；见 [真实编译前后计划与代码](./compiler-plans.json)               |
| 限定 preserve、安全性证明与 fallback            | DONE；`hmr: { preserveBindings: true }` 显式启用；不执行新模块、只 batch 更新旧 cell；其它源码变化 dispose-remount；事件/初始化/结构/once/spread/custom element/raw-text/SSR/manual boundary 回归 |
| 真实 Vite 8 输入/焦点/Dialog/列表/编译错误/回滚 | DONE；九个候选 tarball 仓库外安装，Chromium/Firefox/WebKit 完整链路通过；见 [浏览器报告](./browsers.json)                                                                                         |
| 分支诊断与实验 RFC                              | DONE；[RFC-019](../../rfcs/RFC-019-hmr-literal-bindings.md)、Vite guide 与 compiler API；保留/编译失败/默认 remount 均有分类；runtime 有 plan mismatch、stale patch、rollback/patch failure 诊断  |
| 没有双 root/zombie effect；异常后恢复           | DONE；两 root 的 mount/cleanup 与节点 identity 断言，listener/effect/binding identity 保留；新列表项读取新值；更新失败回滚并触发 Vite invalidate/reload；最终资源释放                             |
| 真实 TSX/JSX 安全子集状态保留                   | DONE；纯字符串表达式 text/class/style，默认仍遵循 RFC-017；没有宣称任意闭包/组件热替换                                                                                                            |

## 验证环境与命令

macOS arm64，Node `22.23.3`，Cargo/Rust `1.95.0`，Vite `8.3.4`，Vitest `4.1.9`，
Playwright `1.64.1`，Native target `aarch64-apple-darwin`，WASM target `wasm32-unknown-unknown`。
下列 PASS 命令实际 exit code 均为 0；本地使用 `node node_modules/<tool>/...` 运行对应脚本，
Rust 使用共享 `CARGO_TARGET_DIR` 和已缓存的依赖，不修改主 checkout 的 Cargo 配置。

| 命令                                                                                                 | 结果 / 原始日志                                                                                    |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `cargo clippy --workspace --all-targets --locked --offline -- -D warnings`                           | PASS；同时修复基线中阻塞此门禁的冗余 match/raw string 和格式问题，无行为变化                       |
| `cargo test --workspace --locked --offline`                                                          | PASS；142 tests；[日志](./rust-tests.log.txt)                                                      |
| Native `napi build --platform --release --js index.js --dts index.d.ts`（在 compiler-native 包目录） | PASS；真实本机二进制，随后复制到 host platform 包用于打包                                          |
| `node --test packages/core/compiler-native/__tests__/*.test.cjs`                                     | PASS；33 tests，含 Unicode/CRLF/source map 与单一 dispose callback；[日志](./native-tests.log.txt) |
| WASM release 构建 + `node --test packages/core/compiler-wasm/__tests__/*.test.mjs`                   | PASS；4 tests / 234 transforms 与 Native 完全相同；[日志](./wasm-tests.log.txt)                    |
| `vitest --run --project unit`                                                                        | PASS；172 files / 1908 tests；[日志](./unit-tests.log.txt)                                         |
| 最终 compiler / vite-plugin / runtime HMR 定向测试                                                   | PASS；11 files / 191 tests；[日志](./targeted-tests.log.txt)                                       |
| `build`、`build-dts`、`check`、`lint`、`format-check`、`check:docs`                                  | PASS；已有 Vite-plugin `node:crypto` external 提示不影响构建                                       |
| `check:runtime-interop`、`check:cjs`、`check:exports`、`api:check`                                   | PASS；CJS 21 包 / 30 exports / 60 条件加载 / 46 wrapper fallback；API 快照同步四个受影响入口       |
| `check:hmr-packed`                                                                                   | PASS；真实 npm tarball 独立安装 + 三引擎 Vite dev E2E；[包版本、解析入口与 SHA-256](./packed.json) |

packed verifier 在 clean Node 子进程确认每个入口位于隔离安装内，并在没有 workspace paths
的 tsconfig 与环境中加载候选插件。没有使用源码链接或 TypeScript alias 替代公开包。
成功 fixture 已自动删除；报告保留当时的安装路径，tarball 内容摘要用于识别候选产物。

## 浏览器断言与计数解释

三个引擎均验证：注释保留；literal text/class/style patch；输入值、selection、焦点、Dialog
open、scroll 与对象状态；两 root 和现存列表节点 identity；同一批 owner/effect/binding ID；
安全 patch 前后诊断 snapshot 完全相等；列表增删清理与未来挂载；第一次编辑即语法错误；
连续修改、编译 overlay 与恢复；新页面获取新源码；初始化变化 remount；remount 后再 patch；
强制 DOM 写入抛错、回滚和 Vite reload；最终手工 disposer。

报告包含真实分配与释放计数，至少一份直接原生 scroll listener（1 → 1，最终 1/1），
不使用代理 document listener 的零计数冒充 listener 验证。采样作用域位于 render callback，
故 root owner 分配不在该计数器内；owner identity 通过 DevTools 的真实事件验证（2 个 root
owner），root teardown 另由 cleanup 次数和 DOM 断言验证。计数不能代替 GC heap 证据。
失败注入后会发生完整页面 reload，最后的 disposed snapshot 属于 reload 后的新诊断会话。

## API、风险与后续

- 新增 compiler/native/WASM `hmrPlan`，runtime-dom helper `createHmrState`；Vite `hmr` 接受
  `{ preserveBindings: true }`。公开六 Primitive 与 WC ABI 不变。compiler/runtime 须来自匹配
  构建，beta 不提供旧 helper/plan 的兼容层。
- Rust 签名只放行字面量字符串；任意表达式、组件依赖模块、WebC、DOM property、once 等仍
  remount。非 literal 源码中仅有空白/注释差异也可能保守 remount，不宣称更广语义等价。
- 签名和 cells 只在 DOM dev HMR 模块生成；production/SSR 无边界注入。生产路径可 tree-shake
  未使用的 helper。没有新增依赖、网络执行源码或 eval；patch 只传 JSON 数据。
- Vite 每模块只保留一个 dispose callback，生成代码把 root 与 cell 释放合并；patch 后显式
  失效 Vite 缓存并推进 HMR 时间戳，使后来的页面和失败 invalidate 能正确恢复。
- 本机 Windows/Linux/其它 Node 版本：NOT_RUN；CI 已接入 packed gate，尚未推送执行。
  不将 macOS 三引擎结果扩大为跨平台结论。npm 发布、main 合并、部署：未执行。
- PR-22 现在可消费本实验 HMR 原因；PR-21 仍缺 Admin/WebC consumer/AI starter 和跨平台矩阵，
  PR-23 的 Lint/editor/plugin 闭环仍待实现，详见进度台账。

## 审查结论

已按 code-review-and-quality 检查正确性、可读性、架构、边界与性能：签名没有哈希碰撞
近似，binding schema 不变；同 engine 的 batch 更新不 rerender；没有重复 lowering；
ErrorBoundary 不会吞掉 HMR 写入失败；dispose/off、乱序、重复消息与回滚均有回归。
已有命令全部通过，本切片可在实验边界内审阅。性能数据只说明本次 parity 测量，未建立阈值。
分支保持本地可恢复提交；主 checkout 的用户 `Cargo.toml` profile 改动未纳入提交。
