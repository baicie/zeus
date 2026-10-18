# RFC-014：Zeus Router Adapter

- 状态：Accepted（E-001）
- 日期：2026-10-18
- 依赖：RFC-001、RFC-006、RFC-009
- 实现：`@zeus-js/router`

## 摘要

Zeus Router 适配现有的 `@remix-run/router` data-router core。路由匹配、嵌套
route tree、history、动态参数、loader/action、错误向最近声明的边界传播以及
fetcher 由该库负责；Zeus 只负责把不可变的 `RouterState` 投影到细粒度 signals，
并把 owner disposal 接到 `router.dispose()`。

Zeus 不实现第二套路由匹配器、缓存或 VDOM。路由组件读取 `pathname()`、`params()`、
`loaderData()` 和 `errors()` 等 accessor 后，由编译后的 DOM 绑定完成精确更新。

## 公共 API

```ts
import { createRouter } from '@zeus-js/router'
import { createMemoryHistory } from '@remix-run/router'

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ['/users/42'] }),
  routes: [
    {
      id: 'root',
      path: '/',
      children: [
        { id: 'user', path: 'users/:id', loader: ({ params }) => params.id },
      ],
    },
  ],
})

router.pathname() // '/users/42'
router.params() // { id: '42' }
await router.navigate('/users/43')
await router.preload('/users/44')
router.dispose()
```

`createRouter` 未提供 `history` 时，在浏览器环境创建 `createBrowserHistory`，
在无 DOM 环境创建 `createMemoryHistory`。可以显式传入任一 `History`，这使 SSR、
测试和嵌入式应用不依赖全局浏览器对象。

## 响应式与生命周期

适配器持有一个 `RouterState` signal。每次核心订阅回调在一个 `batch` 中发布新的
快照；`pathname`、`search`、`hash`、`matches`、`params`、`loaderData`、`actionData`、
`errors`、`navigation` 和 `revalidation` 通过稳定 accessor 暴露。

在 Zeus owner 内创建适配器时，`onCleanup` 自动调用 `unsubscribe` 和
`router.dispose()`。没有 active owner 时仍可显式调用 `dispose()`；适配器不会创建
隐式长期 root。

## 错误边界

`@remix-run/router` 将 loader/action 异常收集到 `state.errors`，并按照其
`hasErrorBoundary` route metadata 向最近边界传播。Zeus 不替路由树伪造边界组件；
组件根据 `errors()` 与 `matches()` 选择错误 UI，从而保持路由核心与 DOM renderer
解耦。

## 预加载

浏览器中 `preload(to)` 使用核心 `router.fetch` 在 fetcher 中运行目标叶子 route 的 loader，
等待 fetcher 完成后释放临时 key，因此不会改变当前 URL。预加载只承诺 loader 数据
预取；组件 chunk、跨请求缓存和链接 hover 策略由上层应用决定。目标没有匹配 route
id 时抛出可诊断错误。`@remix-run/router` 明确禁止 SSR router 执行 fetcher 预取，
所以服务端调用 `preload()` 会 reject 并给出核心库错误；SSR 预取属于独立的数据加载流程。
fetcher 错误按核心库规则进入当前页面最近的错误边界，而普通导航中的 loader 错误进入
目标 route 最近的错误边界。

## 非目标与迁移规则

- 不引入 Virtual DOM、组件 rerender 或自建 route matcher。
- 不把 `@remix-run/router` 的 `RouterState` 直接变成 Zeus 公共响应式契约。
- 不保留旧 router alias、兼容入口或 deprecated fallback。
- SSR 只使用显式 `createMemoryHistory`；服务端静态数据查询和 hydration 属于
  E-005/E-006，不由本 adapter 提供。
