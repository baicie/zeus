# Next.js Server / Client 边界

在仓库根先 `pnpm build && pnpm build-dts`，再运行：

```sh
pnpm -F @zeus-js/example-next-boundary dev
pnpm -F @zeus-js/example-next-boundary build
pnpm -F @zeus-js/example-next-boundary start
```

`build-components.mjs` 使用 Zeus 的公共 Rollup 插件，从 `components/counter.tsx`
生成 WC、Manifest、React wrapper 和声明；Next.js 消费生成产物。

- `app/page.tsx` 是 Server Component。静态宿主标签、文本 children 和数字/字符串属性
  可直接输出，无需 `use client`。服务端不注册元素，也不执行内部 DOM 渲染。
- `app/interactive-counter.tsx` 通过 `use client` 建立边界：React 状态、事件回调、ref、
  对象/函数 property 必须留在客户端，不能跨 Server Component 边界序列化。
- Client Component 也会由 Next.js 预渲染宿主 HTML。生成 wrapper 的 Node 导入安全，
  浏览器注册并升级元素、挂载新的 Shadow DOM；这不是 Zeus 内部 DOM hydration。
- 本页客户端 wrapper 同时注册全局 `z-next-counter`，静态宿主也会升级。只需静态
  HTML 的页面可以完全省略客户端模块；需要升级时须在客户端加载生成注册入口。

`pnpm check:next-boundary` 对生产 Next server 执行禁用 JS 的宿主/属性断言，
以及 Chromium/Firefox/WebKit 的升级、事件/状态、DOM identity 和 hydration 错误检查。
该示例不证明 Zeus 自动 SSR/Hydration、完整 UI Golden 组件或 registry 发布验收。

边界规则参见 [Next.js 官方文档](https://nextjs.org/docs/app/getting-started/server-and-client-components)。
