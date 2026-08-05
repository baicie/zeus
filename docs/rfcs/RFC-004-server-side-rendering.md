# RFC-004：服务端字符串渲染

## 状态

Accepted

## 目标

Zeus SSR 基线负责在没有 DOM 全局对象的服务端环境中执行组件一次，并把编译后的
JSX 同步序列化为 HTML 字符串。服务端与浏览器端共享同一套 JSX lowering 和 Zeus
IR，分别使用 SSR codegen 与 DOM codegen。

首个公开入口为：

```ts
import { renderToString } from '@zeus-js/zeus/server'

const html = renderToString(() => <App />)
```

`renderToString` 在独立的响应式 scope 中求值，返回前释放该 scope。组件初始化、memo
读取和 cleanup 因而仍遵循 Zeus 的运行时响应式语义，但服务端不会建立持续更新的
effect。整个协议严格同步：render factory、组件结果、文本、attribute、class、style 或
property 的任意层级一旦出现 Promise 或其他 thenable，立即抛出
`renderToString() does not support async render values.`，而不是等待、忽略或输出空内容。

## 编译器契约

`CompilerOptions.generate` 支持两个唯一模式：

- `dom`：生成精确 DOM 创建与绑定代码；
- `ssr`：生成 `@zeus-js/runtime-ssr` 序列化调用，不引用 `document`、`Node` 或 DOM
  runtime。

Vite 插件在普通 transform 中选择 `dom`，在 `transformOptions.ssr === true` 时自动选择
`ssr`。用户可以通过 `ssrModuleName` 替换 SSR runtime 模块名；DOM runtime 仍由
`compiler.moduleName` 配置。

SSR codegen 必须支持：

- 原生元素、void elements 与 Fragment；
- 静态及动态文本；
- 静态及动态 attribute；
- `class` / `className` 的字符串、数组与对象值；
- `style` 的字符串与对象值；
- 按元素上下文验证、且具有等价 HTML 表示的 property binding；
- 组件及惰性 props / children；
- `Show` 和 `For`。

事件和 ref 没有可序列化的服务端语义，SSR codegen 直接省略它们。`Host`、`Slot` 与
`defineElement` 的服务端输出不属于本 RFC；SSR codegen 遇到这些内置节点时必须明确
拒绝，而不是生成含糊的 HTML。

## 序列化规则

- 普通文本上下文中的动态文本转义 `&`、`<` 和 `>`；静态 JSX 文本沿用 lowering
  阶段已有的转义结果。
- `<script>` 与 `<style>` 使用 HTML raw-text 语义：普通 `<` 和 `&` 保持原样；为防止
  内容提前闭合元素，匹配当前元素名的结束标签会在完整 children 拼接后安全改写
  （script 使用 JavaScript `\\u003C` 转义，style 使用 CSS `\\3C ` 转义）。这也覆盖被
  Fragment、`Show`、`For` 或相邻 child 拆开的结束标签。script 序列化还会跟踪 HTML
  tokenizer 的 escaped state，并改写会进入 double-escaped state 的 `<script` 序列，
  保证框架生成的结束标签仍能闭合元素。
- raw-text 元素仅允许直接文本、Fragment、`Show` 和 `For`；原生元素或组件子节点在
  编译期抛出 `ZEUS_UNSUPPORTED_SSR_RAW_TEXT_CHILD`。动态值若已经是序列化后的
  `SSRFragment`，运行时也会拒绝，因为此时无法恢复其原始文本转义上下文。
- attribute 值至少转义 `&`、`"`、`<` 和 `>`。
- `null`、`undefined`、`false` attribute 被省略；`true` 输出无值的布尔 attribute。
- 文本位置的 `null`、`undefined` 和 boolean 输出为空字符串。
- 数组按顺序递归展开。
- property binding 仅接受具有确定 HTML 表示的元素/property 组合：`value` 支持
  `button`、`input`、`option` 和 `textarea`；`checked` 仅支持 `input`；`selected` 仅
  支持 `option`；`multiple` 支持 `input` 和 `select`；`disabled` 支持 `button`、
  `fieldset`、`input`、`optgroup`、`option`、`select` 和 `textarea`；`readOnly` 支持
  `input` 和 `textarea`；`htmlFor` 仅支持 `label`；`tabIndex` 可映射到任意元素。
- `textarea.value` 序列化为转义后的文本内容并覆盖原有 children；`readOnly`、
  `tabIndex`、`htmlFor` 分别映射到 `readonly`、`tabindex`、`for`。其余 property
  映射为同名 string 或 boolean attribute。
- 白名单 property 仅序列化 string、number 和 boolean；其他类型被省略。实际序列化的
  property 会覆盖同名静态 attribute。
- 不具备确定 HTML 等价语义的 property 或元素组合（例如 `textContent`、
  `select.value`）在编译期抛出 `ZEUS_UNSUPPORTED_SSR_PROPERTY` 结构化诊断。
- 任何序列化位置出现 thenable 都是同步协议错误，不按普通空值处理。
- 标签名和 attribute 名只来自编译期 IR，不接受运行时拼接的名称。

这些规则保证普通文本和 attribute 数据不能突破当前 HTML 上下文。本阶段不提供
`innerHTML` 或其他绕过转义的公共 API。

## Package 与入口

- `@zeus-js/runtime-ssr`：仅包含 SSR node、序列化 helper、控制流和组件调用；不得依赖
  `runtime-dom`。
- `@zeus-js/zeus/server`：导出 `renderToString`、SSR 类型、服务端 `Show` / `For`，以及
  Zeus 响应式公共 API。
- `@zeus-js/compiler`：从同一 IR 分派 DOM 或 SSR codegen。
- `@zeus-js/vite-plugin`：根据 Vite transform 上下文自动选择目标。

## 命令与验证

```sh
pnpm exec vitest run packages/core/runtime-ssr packages/core/compiler packages/devtools/vite-plugin
pnpm check
pnpm build runtime-ssr compiler zeus vite-plugin
pnpm test-unit
```

测试必须覆盖 HTML/attribute 转义、script/style raw-text、thenable 拒绝、property
元素上下文校验、void element、class/style、组件、Fragment、`Show`、`For`、scope
cleanup、SSR 编译产物不含 DOM 引用，以及 Vite SSR transform 的 runtime 选择。

## 边界

- 必须：保持组件单次执行、复用 Zeus IR、无 DOM 全局依赖、默认安全转义。
- 变更前确认：新增第三方依赖、改变既有 DOM codegen、扩大到异步协议。
- 禁止：通过 JSDOM 实现 SSR、引入 VNode diff、从 `runtime-dom` 导入实现。

## 非目标

- hydration 与客户端接管；
- streaming / async SSR；
- Suspense、资源预取与服务端调度；
- Web Components、Declarative Shadow DOM、light DOM slot 投影；
- SSR 专用 IR 或 Rust codegen。

这些能力需要单独 RFC。当前输出是完整 HTML，客户端若继续挂载会重新创建 DOM。

## 验收标准

1. Node 环境可从 `@zeus-js/zeus/server` 同步得到正确 HTML，且不需要 DOM shim。
2. Babel `generate: 'ssr'` 编译上述基线节点并只导入 SSR runtime。
3. Vite SSR transform 自动生成 SSR 代码，浏览器 transform 行为保持不变。
4. 新增行为有单元及集成测试，类型检查、目标构建和完整单元测试通过。
