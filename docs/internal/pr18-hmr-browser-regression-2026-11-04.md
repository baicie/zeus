# PR-18 HMR 浏览器回归修复

日期：2026-11-04。状态：RESOLVED，`pnpm check:hmr-browser` 在
Chromium、Firefox、WebKit 三引擎通过。

## 根因

Vite 8 把逐环境 HMR 钩子从 `handleHotUpdate` 迁移到 `hotUpdate`。插件仍只实现旧钩子，
因此真实 dev server 的热更新没有进入 Zeus 的分类、literal-binding patch、编译错误保留和
回滚路径，而是走了普通 `js-update`。这解释了此前“首击后 DOM/状态被重置、无
`hmr:patch` 事件”的现象；直接调用 `handleHotUpdate` 的单测仍能通过，所以没有暴露契约
迁移。

另一个独立竞态在门禁本身：fixture 文件在 Vite watcher 完成初始扫描前写入，可能被当成
迟到的 `add` 事件，在页面加载后触发一次 HMR 重载，污染注释保留与首击断言。

## 修复

- 插件改为实现 Vite 8 `hotUpdate`，仅处理 `type === 'update'` 且
  `this.environment.name === 'client'` 的事件，避免 SSR 环境重复发送补丁。
- WebSocket 与模块失效改用当前 environment 的 `hot.send()` /
  `moduleGraph.invalidateModule()`，不再依赖已移除的 `server.ws`。
- 浏览器门禁在 watcher ready 后创建 fixture，并等待两个 fixture 模块的 `add` 事件完成，
  再打开页面；不改变 HMR 行为，只消除初始化时序噪声。
- 单测覆盖新钩子、client-only 过滤、literal patch 连续更新、编译错误保留与回滚。

## 证据

| 命令                                                                     | 结果                                                              |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `pnpm exec vitest --run --project 'unit*' packages/devtools/vite-plugin` | PASS；6 files / 107 tests                                         |
| `pnpm check:hmr-browser`（Chromium/Firefox/WebKit）                      | PASS；`temp/hmr-browser-report/report.json` 三个引擎均为 `passed` |
| `pnpm check:hmr-packed`（Chromium/Firefox/WebKit）                       | PASS；候选 tarball 在仓库外安装后完成同一门禁                     |

报告覆盖注释保留、literal text/class/style patch、双 root identity、
owner/binding/effect identity、输入/焦点/Dialog/scroll/对象状态、列表清理与
未来挂载、连续更新、编译错误 overlay 与恢复、新页面最新源码、初始化变化 remount、
remount 后再 patch、强制写入失败回滚与 Vite reload、最终资源释放。

## 边界

- 仅 macOS arm64、Node 24.18.0、Vite 8.3.4 实测；Win/Linux 与其它 Node 版本未跑。
- Packed 门禁必须先重建 host 平台 native 包（`pnpm native:build:platform --target <target>`）。
  旧的平台二进制缺少 `hmrPlan`，会让 literal-binding 断言静默退回普通 HMR。
