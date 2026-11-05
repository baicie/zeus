# PR-21 / PR-22 工具链基线复核

本轮状态：PARTIAL。仓库 `baicie/zeus`，工作分支 `codex/pr21-template-registry`，
base `cb52cb0`。设计来源：用户提供的
`Zeus-0.2.0-Full-Platform-Design-Kit-v1.0.zip` 中 PR-18/21/22/23、ADR-06、G5/G6/G14。

## 已交付改动

- WebC 的 Vite adapter 将 signal、DOM、SSR、Zeus façade 同时加入 `resolve.dedupe` 和
  `optimizeDeps.exclude`。保持与 Native Vite plugin 相同的 runtime graph 约束；定向测试
  验证配置。这里的测试不等同于已经在 registry 发布并验证此候选 adapter。
- DevTools 浏览器门禁改用 Vite 的 `build/createServer/close` API 管理服务器。修复原先只
  结束 `pnpm` 包装进程、等待退出而无法写报告的问题，跨平台不依赖 shell 进程组。
- 纠正进度台账：PR-18 既有测试只证明注释保留和 remount；原设计的 compiler signature
  和 TSX binding patch 尚未实现。PR-21–23 分别跟踪，不能以基线通过关闭这些切片。

## 实际执行

环境：macOS arm64，Node 22.23.3；workspace Vite 8.3.4 / Vitest 4.1.9；registry
消费者 Vite 8.3.5 / Vitest 4.1.12。所有 PASS 命令 exit code 为 0。

| 命令（直接运行同名本地二进制）                                                            | 结果                                                                              |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `tsx scripts/bundler/build.ts`                                                            | PASS；已有 `node:crypto` external warning                                         |
| `tsc -p tsconfig.build.json --noCheck` + Rollup DTS                                       | PASS                                                                              |
| `tsx scripts/check/check-create-zeus.ts`                                                  | PASS；四旧模板 check/build，Application/Library 测试与组件库输出                  |
| `tsx scripts/check/check-create-zeus-registry.ts`                                         | PASS；四旧模板真实官方 registry 安装、check/build/test、Chromium dev/preview 交互 |
| `vitest --run --project unit packages/web-c/bundler-plugin packages/devtools/vite-plugin` | PASS；19 files / 245 tests                                                        |
| adapter 配置定向测试                                                                      | PASS；2 files / 32 tests                                                          |
| CEM / Custom Data / output-wc 定向测试                                                    | PASS；3 files / 49 tests；只验证既有能力                                          |
| `tsx scripts/check/check-devtools-panel.ts`                                               | PASS；Chromium、Firefox、WebKit；采用 Vite API 后重跑，正常退出                   |
| `tsc --incremental --noEmit`、ESLint、Prettier、`check-docs.ts`                           | PASS；提交前对最终变更再核对                                                      |

[registry 原始报告](./registry-baseline.json)记录源码模板与已发布 beta.20 / vite-plugin
0.0.5 的实际安装版本及入口，全部在 workspace 外解析。该报告证明已发布基线可用，
**不证明本轮尚未发布的 bundler-plugin 修复**。首次安装因官方 registry TLS 重置失败，
后续重试完成全部检查。成功 fixture 已由脚本删除。

[DevTools 报告](./devtools-baseline.json)记录三个引擎均无 pageerror 和 HTTP 失败。
对应截图留在工作树 `temp/devtools-panel`。

## 未完成与下一步

PR-21 的推荐模板补齐进度：

- `admin-ts`：已加入 CLI 与 `check:create-zeus`；并在仓库外以官方发布依赖安装，
  通过 typecheck/build/Vitest 以及 dev/preview 三引擎浏览器登录、搜索、视图切换
  与登出验收（`--template admin-ts --browsers chromium,firefox,webkit`）。
- `webc-consumer-ts`：已加入 CLI 与 `check:create-zeus`，并在仓库外以
  `@zeus-web/button@0.1.0-beta.34` 真实安装，通过 dev/preview 三引擎点击验收。
  该模板只消费已发布 WebC 包，不依赖 workspace 路径。
- create-zeus CLI 新增 `--name` / `--template` / `--help` 非交互入口。
  `check:create-zeus-packed` 打包当前候选 tarball，在仓库外安装并生成
  `basic-ts`，随后从 registry 安装模板依赖，完成 typecheck 与 production build。
- 组件库模板的 registry dev 在当前已发布 `@zeus-js/web-c@0.1.1-beta.20` 上仍会报
  signal engine 分裂；本仓源码已包含 runtime graph 去重修复，但未随该版本发布。
  这不是模板源码可单独绕过的旧包缺陷，需重新发布后复验。

PR-21 尚缺 AI reference starter（`@zeus-web/ai-*` 尚未发布）、候选 CLI tarball
的仓库外使用、Windows/Linux/其它 Node 支持版本的实际执行证据。`create-zeus`
registry 门禁现支持 `--browsers chromium,firefox,webkit`，本机两新模板三引擎通过；
其余旧模板与正式 devtools release 使用同一参数后仍待实跑。
PR-22 尚缺 Timeline、WebC/多 root/GC 和 instrumentation 开销测量。
PR-23 的 external 编辑器/Lint、可运行扩展插件样例仍未开始。

优先继续 PR-18：实现编译器结构签名与经过证明的真实 TSX 安全绑定 patch，覆盖输入、
焦点、Dialog、列表、异常编译与恢复。依照 RFC-017 先补实验 RFC，再扩默认保留分类。
本轮没有新增依赖或执行发布；主 checkout 的用户 `Cargo.toml` 改动未纳入提交。
