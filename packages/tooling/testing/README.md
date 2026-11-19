# @zeus-js/testing

Zeus 的官方测试工具，面向组件和应用测试提供稳定的公共入口，不要求测试代码导入 runtime-dom 或 signal 的 private subpath。

```ts
import {
  fireEvent,
  flushEffects,
  queryByRole,
  render,
} from '@zeus-js/testing'

const view = render(() => <button onClick={() => {}}>Save</button>)

fireEvent.click(queryByRole(view.container, 'button', { name: 'Save' })!)
await flushEffects()
view.dispose()
```

`render` 返回当前容器、`dispose`/`unmount` 和 `rerender`。`fireEvent` 创建并派发 DOM 事件；`queryByRole` 支持显式 role 以及常用原生元素的隐式 role，并可按 accessible name 过滤。

该包只依赖 `@zeus-js/zeus` 公共 API。它不提供网络、浏览器启动或快照功能；浏览器级测试继续使用项目的 Playwright/Puppeteer 配置。
