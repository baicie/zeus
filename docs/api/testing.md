# `@zeus-js/testing`

`@zeus-js/testing` 是 Zeus 的官方测试工具包。它把常见的渲染、用户输入、事件派发、异步 effect 等待、泄漏检查和可访问性查询组合成稳定的公共入口。

## 安装

```bash
pnpm add -D @zeus-js/testing
```

测试运行器需要提供 DOM 环境。使用 Vitest 时可以配置 `jsdom`，或者在测试中创建 JSDOM 并将 `window`、`document` 和相关 DOM 构造器注入当前环境。

## 渲染与生命周期

```tsx
import { render } from '@zeus-js/testing'

const view = render(() => <button>Save</button>)

view.container // 当前测试容器
view.baseElement // 容器所属 document 的 body
view.rerender(() => <button>Saved</button>)
view.unmount() // 与 dispose 等价
view.dispose()

// 可选：清理当前测试环境创建的所有 view
cleanup()
```

`render` 默认创建隔离的 `div` 容器，也可以传入已有容器：

```ts
const view = render(value, { container: document.querySelector('#test-root')! })
```

`dispose` 可以重复调用。调用后，容器内容会清空，绑定和响应式作用域同时释放。

## 用户交互与异步断言

```ts
import { userEvent, waitFor } from '@zeus-js/testing'

await userEvent.type(input, 'hello')
await userEvent.composition(input, { updates: ['中'], end: '中' })
await userEvent.click(save)
await waitFor(() => expect(status.textContent).toBe('Saved'))
```

`userEvent` 会发送键盘、输入和 IME composition 事件，并在每次操作后等待
微任务。`waitFor` 反复执行断言直到成功或超时，`waitForElement` 是其 DOM 查询变体。

## 事件与 effect

```ts
import { fireEvent, flushEffects } from '@zeus-js/testing'

fireEvent.click(button)
fireEvent(input, 'input', { bubbles: true })
await flushEffects()
```

`fireEvent` 接受事件对象或事件类型字符串。字符串形式会根据事件类型选择常用 DOM 事件构造器，并将额外字段定义到事件对象上，适合测试 `detail` 等自定义数据。

## Role 查询

```ts
import { queryByRole } from '@zeus-js/testing'

const save = queryByRole(view.container, 'button', { name: 'Save' })
```

查询支持显式 `role` 和常用原生元素的隐式 role，包括 button、link、heading、checkbox、radio、textbox、img、list、listitem 与 option。`name` 可使用字符串或正则表达式，并按 `aria-labelledby`、`aria-label`、`alt`、`title` 和文本内容计算 accessible name。

## SSR、Hydration 与泄漏检查

```ts
const html = renderSSR(() => 'server')
const hydrated = hydrateSSR(html, () => {})

const leaks = startLeakCheck()
const view = leaks.run(() => render(() => <Widget />))
view.dispose()
leaks.assertNoLeaks()
leaks.dispose()
hydrated.dispose()
```

`renderSSR` 使用 `@zeus-js/zeus/server`，`hydrateSSR` 只在测试真正需要 DOM 时创建
容器；两者都可以用于独立的 SSR import 回归。`startLeakCheck` 通过公开的
`@zeus-js/signal/diagnostics` 记录 effect、scope、owner、binding 和 listener 的
创建/释放差额。

## 公共边界

包的运行时依赖是 `@zeus-js/zeus` 和公开的 `@zeus-js/signal/diagnostics`。应用测试不应从
`@zeus-js/runtime-dom` 或 `@zeus-js/signal/internal` 导入实现细节；这些模块属于 Zeus
内部实现，可能随框架演进而变化。
