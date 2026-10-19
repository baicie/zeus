# E-009 Web UI 标杆项目

Zeus 的 Web UI 标杆由 `scripts/testing/packed-consumers/component.tsx.fixture`
作为唯一组件源码，构建三种消费入口：

- Native：`@zeus-js/zeus` + DOM 编译器。
- React 18/19：同一 `z-packed-button` / `z-packed-light-panel` Manifest 生成的 wrapper。
- Vue 3：同一 Manifest 生成的 wrapper 和事件映射。

`pnpm check:web-ui-reference` 会先对本地产物执行 `pnpm pack`，在隔离临时工程安装
所有 tarball，然后逐一运行 Node SSR import、TypeScript consumer、Vite production build
以及 Chromium、Firefox、WebKit 浏览器行为检查。行为矩阵覆盖属性、事件、Slot、Methods、
Form、焦点和 detach/reconnect。

报告写入 `temp/packed-consumers/report.json`。该报告使用本地产物，不冒充 npm registry
版本；发布前仍需运行 release preflight 和外部 npm provenance 校验。
