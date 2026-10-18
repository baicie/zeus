# `@zeus-js/testing`

`@zeus-js/testing` 是 Zeus 的官方测试工具包。它把常见的渲染、事件派发、异步 effect 等待和可访问性查询组合成稳定的公共入口，测试代码不需要依赖 runtime-dom 或 signal 的 private subpath。

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
```

`render` 默认创建隔离的 `div` 容器，也可以传入已有容器：

```ts
const view = render(value, { container: document.querySelector('#test-root')! })
```

`dispose` 可以重复调用。调用后，容器内容会清空，绑定和响应式作用域同时释放。

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

## 公共边界

包的唯一运行时依赖是 `@zeus-js/zeus`。应用测试不应从 `@zeus-js/runtime-dom` 或 `@zeus-js/signal/internal` 导入实现细节；这些模块属于 Zeus 内部实现，可能随框架演进而变化。
