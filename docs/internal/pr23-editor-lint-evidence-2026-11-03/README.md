# PR-23：编辑器元数据、Lint 与插件文档增量验收

状态：PARTIAL / READY_FOR_REVIEW。仓库 `baicie/zeus`，分支
`codex/pr23-editor-lint`，base `e2b04db`。本切片新增可发布的
`@zeus-js/eslint-plugin`，并对齐 CEM、VSCode Custom Data、诊断分层与 Output Plugin
安全边界；不宣称已实现 Zeus LSP。

## 交付

- `@zeus-js/eslint-plugin` 提供 ESLint flat config、ESM/CJS/类型入口和
  `zeus/recommended`：
  - `zeus/no-internal-imports` 拒绝 `internal`、`src`、`dist` 和仓库 package
    源路径；`@zeus-js/signal/diagnostics` 保持允许。
  - `zeus/valid-builtin-usage` 检查 `Show.when`、`For.each`、`For` 函数 child、
    `Host` 的 `defineElement` 边界与根位置，以及 `Slot` 的 `Host` 边界。
- 两条规则都不声明 autofix/suggestion。错误 import 不一定存在公共替代，自动重排
  JSX 会改变 owner 与 cleanup 语义。
- 外部 packed consumer 同时验证 CJS require、ESM flat config、TypeScript 声明、
  有效/无效源码和 `--fix` 不修改有歧义源码。
- 编辑文档明确 HTML Custom Data 只承载 tag/attribute/literal value；events、methods、
  slots 保留在 CEM，TSX/React/Vue 由生成声明提供 props/event detail 类型。
- 新增诊断分层页，区分 Rust compiler、Vite、SSR、WebC output、plugin host、HMR 与
  ESLint；FAQ 不得发明生产层不存在的诊断码。
- Output Plugin 文档记录 Vite 8、Rollup 4、Rolldown 1 兼容域，以及 output plugin
  是完整 Node.js 权限代码、不是 sandbox 的事实。

## 验证

环境：macOS 15.7.7 arm64，Node `24.18.0`，ESLint `10.5.0`，
`typescript-eslint` `8.61.1`，Vitest `4.1.9`。

| 检查                                                             | 结果                                                                         | 证据                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 全量 unit tests                                                  | PASS，174 files / 1931 tests                                                 | [日志](./unit-tests-node24.log.txt)                                      |
| ESLint plugin 定向测试                                           | PASS，2 files / 16 tests                                                     | [日志](./targeted-tests.log.txt)                                         |
| 仓库外 packed ESLint consumer                                    | PASS；ESLint 10、CJS/ESM、types、rules、no unsafe fix                        | [报告](./eslint-consumer-report.json)、[日志](./eslint-consumer.log.txt) |
| CommonJS contract                                                | PASS；22 packages / 31 exports / 62 conditional loads / 48 wrapper fallbacks | [日志](./cjs-check.log.txt)                                              |
| API snapshot                                                     | PASS；新增和同步 `eslint-plugin.main.api.md`                                 | [日志](./api-check.log.txt)                                              |
| Release tarballs                                                 | PASS；29 packages                                                            | [日志](./release-artifacts.log.txt)                                      |
| Docs smoke                                                       | PASS                                                                         | [日志](./docs-check.log.txt)                                             |
| TypeScript、ESLint、Prettier、package exports/version/repository | PASS                                                                         | [静态门禁](./static-gates.log.txt)                                       |

## 边界与后续

- 本切片没有 VS Code extension、LSP、Lint 与编辑器 code action 的 IDE UI 自动化；
  只验证 Custom Data 产物契约和外部 ESLint CLI。
- 规则兼容声明为 ESLint `^10`，没有宣称 ESLint 9 或其它 parser 的验证结果。
- Windows/Linux 外部安装矩阵 NOT_RUN；当前证据仅 macOS arm64 / Node 24。
- Events、methods、slots 的 HTML 编辑器补全不属于 VSCode HTML Custom Data schema；
  CEM 与生成 DTS 是当前可验证来源。
- npm 正式发布、main 合并、在线部署未执行。
