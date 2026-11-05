# PR-22：Native + WebC DevTools Graph/Timeline 增量验收

状态：PARTIAL / READY_FOR_REVIEW。仓库 `baicie/zeus`，分支
`codex/pr22-devtools-timeline`，base `31be74f`。本切片复用既有
`__ZEUS_DEVTOOLS_HOOK__` 协议，补齐 timeline、更新/热更新原因、Custom Element
生命周期、Native Admin 调试场景和生产隔离；不改 Signal 调度或异常传播。

## 交付

- consumer 增加 `custom-element:connect` / `disconnect` 状态，只保存 tag name、
  `targetId`、连接状态和计数，不保存 host/ShadowRoot 引用。
- consumer 增加有界 `timeline`。HMR 路径发送 `hmr:patch`、`hmr:invalidate`、
  `hmr:dispose`，`payload.reason` 区分 `literal-binding`、`plan-mismatch`、
  `stale-patch`、`patch-failed` 和 `module-dispose`。
- 面板增加 Custom Elements、Timeline 与 Refresh 区域。点击 open ShadowRoot
  内绑定仍通过 `composedPath()` 对应到真实 Binding/Effect/Signal。
- DevTools 示例覆盖 Native 两个 render root、light/shadow Custom Element、断开重连、
  Shadow DOM 内点击、对象更新和清理。
- Admin 在开发服务器使用 `/admin/users?devtools=1` 显式挂载面板，验证 owner、
  binding、timeline、刷新和关闭；生产 bundle 不包含该分支或 DevTools 字符串。
- Custom Element 和 HMR 新事件均在 `__DEV__` 下发送，DevTools observer 抛错被隔离，
  不影响绑定写入、HMR patch、回滚或 cleanup。

## 验证

环境：macOS 15.7.7 arm64，Node `24.18.0`，Vite `8.3.4`，Vitest `4.1.9`，
Playwright `1.64.1`。

| 检查                                                                          | 结果                                            | 证据                                                         |
| ----------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| 全量 unit tests                                                               | PASS，172 files / 1915 tests                    | [日志](./unit-tests-node24.log.txt)                          |
| 定向 runtime/consumer tests                                                   | PASS，3 files / 41 tests                        | [日志](./targeted-tests.log.txt)                             |
| Light/Shadow Custom Element、多 root、timeline、ShadowRoot 点击               | PASS，Chromium/Firefox/WebKit                   | [报告](./panel-report.json)、[日志](./panel-browser.log.txt) |
| Native Admin graph/timeline/refresh/cleanup                                   | PASS，Chromium/Firefox/WebKit                   | [报告](./admin-report.json)、[日志](./admin-browser.log.txt) |
| RFC-019 HMR reason 与原有状态保留回归                                         | PASS，Chromium/Firefox/WebKit                   | [报告](./hmr-report.json)、[日志](./hmr-browser.log.txt)     |
| 生产 runtime 不含 Custom Element/HMR 新 instrumentation                       | PASS；门禁在 panel browser check 中逐字符串断言 | [日志](./panel-browser.log.txt)                              |
| TypeScript、ESLint、Prettier、docs、build、API、exports、CJS、runtime interop | PASS                                            | [静态门禁](./static-gates.log.txt)                           |

## 边界与后续

- 本切片没有执行 `WeakRef`/`FinalizationRegistry` GC 时序证明。当前可证明的是
  consumer/timeline 不保存 Node、host 或 ShadowRoot，且断开条目受 `historyLimit`
  限制；真实 GC 回归仍为 NOT_RUN。
- Signal 当前值编辑、调用栈采集、跨窗口节点反查和浏览器扩展握手仍不在本切片。
- 浏览器矩阵仅为本机 macOS arm64 上的三引擎；Windows/Linux 原生浏览器未执行。
- `packages/devtools/consumer` 仍是 private 包；本切片不声明 npm 发布或外部 ABI。
