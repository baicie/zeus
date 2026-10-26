# RFC-004：服务端字符串渲染

## 状态

Accepted（2026-10-25 按当前 Rust 编译器、WC 内部 SSR 与显式 hydration 契约修订）

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

`@zeus-js/compiler-native` 的 `transformModule()` 通过 `target` 选择两个唯一模式：

- `dom`：生成精确 DOM 创建与绑定代码；
- `ssr`：生成 `@zeus-js/runtime-ssr` 序列化调用，不引用 `document`、`Node` 或 DOM
  runtime。

Vite 插件在普通 transform 中选择 `dom`，在 SSR module transform 时自动选择
`ssr`，并分别传入 DOM 与 SSR 的 `runtimeModule`。用户可以通过 `ssrModuleName`
替换 SSR runtime 模块名；默认分别为 `@zeus-js/runtime-dom` 与
`@zeus-js/runtime-ssr`。两种 target 复用 Rust lowering 和 Zeus IR，不维护 Babel
编译器分支。

SSR codegen 必须支持：

- 原生元素、void elements 与 Fragment；
- 静态及动态文本；
- 静态及动态 attribute；
- `class` / `className` 的字符串、数组与对象值；
- `style` 的字符串与对象值；
- 按元素上下文验证、且具有等价 HTML 表示的 property binding；
- 组件及惰性 props / children；
- `Show` 和 `For`。

事件和 ref 没有可序列化的服务端语义，SSR codegen 直接省略它们。编译器将
`defineElement`、`Host` 与 `Slot` 降级到专用的 server helpers，不执行浏览器中的
Custom Element 注册或 DOM runtime。其内部 SSR 行为见下节。

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
- `@zeus-js/compiler-native`：从同一 Rust IR 分派 DOM 或 SSR codegen。
- `@zeus-js/vite-plugin`：根据 Vite transform 上下文自动选择目标。

## Web Component 内部 SSR

`@zeus-js/zeus/server` 导出 server-only 的 `defineElement`、`Host`、`Slot` 与
`ssrComponentFromManifest`。Shadow 模式输出宿主及 Declarative Shadow DOM
`<template shadowrootmode="open">`，先写入显式 `styles`，再写入组件内容；Slot
使用原生 `<slot>` 标记。Light 模式使用 Zeus 投影语义，默认 slot 接收 consumer
children；具名 slot 按 consumer 节点的显式 `slot` metadata 分配，否则使用 fallback。

Manifest 输入要求 `schemaVersion: 1`，并共享静态默认值、attribute alias、反射和
shadow 等声明。可序列化的显式原始值及反射默认值写入宿主 attribute；对象、数组、
函数、`attr: false` 与 Host 的 `prop:*`、事件、ref 不写入 HTML。工厂默认值必须由
调用方显式提供，否则抛出 `ZEUS_SSR_DEFAULT_FACTORY_UNSUPPORTED`，不能在 SSR
中猜测初始值。`cssParts` / `cssVars` 是扩展点 metadata，CSS 正文来自 `styles`。

服务端不会注册 custom element、创建 `ElementInternals` 或执行表单 callbacks。
React/Vue wrapper 的 SSR-0 仅输出宿主 tag 与原始属性；它与上述内部 SSR 是两个
明确的入口，不能把 wrapper 的宿主输出当作内部首屏 HTML 验收。

## 显式 Hydration

同一源码的 DOM / SSR target 生成一致的稳定 ID 和 `hydrationPlan`；SSR 输出对应的
HTML markers。客户端通过 `hydrate(container, setup)` 或
`hydratePlan(container, plan, handlers)` 显式建立绑定，复用已有 DOM，检测缺失、
重复或不匹配的 marker，并在失败或 disposal 时清理已经建立的 effects 与 events。
输入值相等时保留焦点、选区及节点 identity。

`hydrationPlan` 只是 metadata，调用方仍需提供每个 binding 的客户端 handler。
不会自动执行第二棵组件树或自动接管 WC 内部 DOM；未调用显式 hydration 而重新
`render` 的应用会创建新节点。Streaming、异步 SSR 和自动组件 hydration 不在当前
契约中。当前实现与使用方式见 [Server Rendering](../guide/server-rendering.md)。

## 命令与验证

```sh
pnpm exec vitest run --project unit packages/core/runtime-ssr packages/core/zeus packages/core/runtime-dom/__tests__/hydration.spec.ts packages/devtools/vite-plugin
pnpm test:compiler-native
pnpm check
pnpm build runtime-ssr zeus vite-plugin
pnpm check:hydration
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

- 自动组件 hydration 与自动 Web Component 内部接管；
- streaming / async SSR；
- Suspense、资源预取与服务端调度；
- SSR 专用 IR 或独立编译器分支。

这些能力需要单独设计与验收；当前同步输出、WC 内部 SSR 与显式绑定重连均使用
同一 Rust 编译链和现有 runtime 协议。

## 验收标准

1. Node 环境可从 `@zeus-js/zeus/server` 同步得到正确 HTML，且不需要 DOM shim。
2. Rust `transformModule({ target: 'ssr', ... })` 编译上述节点与 WC 内置节点，并只导入 SSR runtime。
3. Vite SSR transform 自动生成 SSR 代码，浏览器 transform 行为保持不变。
4. WC 内部 SSR 覆盖 DSD、样式、默认值、Host/Slot、属性一致性；显式 hydration 覆盖 DOM 复用、事件、props、焦点、失配与 cleanup。
5. 新增行为有单元及集成测试，类型检查、目标构建和完整单元测试通过。

## SSR-0 阶段记录（2026-10-18，历史观察）

- `pnpm check:ssr-safe-import` 在独立 Node 子进程中导入 `@zeus-js/runtime-ssr` 与
  `@zeus-js/zeus/server` 的源码入口，确认导入阶段不读取 `document`、`window` 或其他
  DOM 全局，并渲染 `<main id="ssr">ok</main>`。
- `pnpm exec vitest run packages/core/runtime-ssr packages/core/zeus` 覆盖同步
  `renderToString`、原始属性序列化、转义、控制流、scope cleanup、thenable 拒绝和公开
  server 入口。
- 当时 SSR-0 的原始输出没有 hydration marker；这条历史观察不限制当前能力。后续已
  实现共享稳定 ID、binding 重连计划、显式 DOM hydrator 与 WC 内部 DSD 首屏输出，
  按上文当前契约验收。自动组件计划执行、自动 WC 内部 hydration 与 streaming 尚未实现。
