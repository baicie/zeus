# RFC-014：Zeus Router 声明式 Adapter

- 状态：Accepted（E-001；2026-11-01 修订）
- 日期：2026-10-18（初版）、2026-11-01（声明式组件层修订）
- 依赖：RFC-001、RFC-006、RFC-009
- 实现：`@zeus-js/router`

## 摘要

Zeus Router 适配现有的 `@remix-run/router` data-router core。路由匹配、嵌套 route
tree、history、动态参数、loader/action、错误向最近声明的边界传播以及 fetcher 由该库
负责；Zeus 负责两件事：

1. 把不可变的 `RouterState` 投影到细粒度 signals；
2. 在 signals 之上提供声明式组件层（`RouterProvider`、`Link`、`Outlet`）与读取
   accessor 的 hooks。

Zeus 不实现第二套路由匹配器、缓存或 VDOM。组件只初始化一次：声明式组件注册
bindings 与 effect，状态变化只更新受影响的 DOM、文本或属性绑定，绝不重渲染组件树。

## 公共 API

`@zeus-js/router` 只导出 Zeus 自有类型与 API；`@remix-run/router` 是实现细节，
不进入公开声明：

```tsx
import { RouterProvider, Link, Outlet, createRouter } from '@zeus-js/router'
import { render } from '@zeus-js/zeus'

const router = createRouter({
  routes: [
    {
      id: 'root',
      path: '/',
      hasErrorBoundary: true,
      element: () => <Shell />,
      children: [
        { id: 'home', index: true, element: () => <Home /> },
        {
          id: 'user',
          path: 'users/:id',
          loader: ({ params, request }) => loadUser(params.id, request.signal),
          hasErrorBoundary: true,
          element: () => <UserPage />,
          errorElement: () => <UserError />,
        },
      ],
    },
  ],
})

render(
  () => (
    <RouterProvider router={router}>
      <Outlet />
    </RouterProvider>
  ),
  document.getElementById('root')!,
)
```

`RouterProvider` 提供 router context 并渲染 children；未提供 children 时渲染根
`Outlet`。`Outlet` 渲染当前匹配链中下一层的 route `element`；没有 `element` 的
route 是透明的布局层，直接继续渲染下一层。

Router 核心 accessor 与组件层共用同一份状态：

```ts
router.pathname() // '/users/42'
router.params() // { id: '42' }
router.navigation() // { state: 'idle' } | { state: 'loading', location }
router.errors() // { user: ErrorResponse } | null
await router.navigate('/users/43')
await router.navigate(-1)
router.createHref('/users/43')
await router.preload('/users/44')
router.dispose()
```

`createRouter` 未提供 `history` 时，在浏览器环境创建浏览器 history，在无 DOM 环境
创建 memory history。`createBrowserHistory` / `createMemoryHistory` 返回 Zeus 自有
`ZeusHistory` 结构；显式传入的 history 只需满足该结构，SSR、测试和嵌入式应用因此
不依赖全局浏览器对象。

## 公共类型边界

2026-11-01 裁决（PR-19）：

- 公开类型由 Zeus 定义：`ZeusRouteObject`、`ZeusLocation`、`ZeusRouteMatch`、
  `ZeusNavigation`、`ZeusFetcher`、`ZeusNavigateOptions`、`ZeusRouter`。
- 不再从 `@zeus-js/router` re-export `@remix-run/router` 的任何类型或函数；
  初版 RFC 中的 `AgnosticDataRouteObject`、`RouterState`、`To` 等 API 被直接删除，
  不保留别名或转发。
- `loader` / `action` 收到 `{ request, params }`，取消信号由 `request.signal`
  提供；返回值、`Response` 与 redirect 语义保持 remix 行为。
- route 可声明 `element` / `errorElement`：这是 Zeus 组件层元数据，remix 会原样
  保留未知字段。
- 未来迁移到其他 router 包时，signals 投影、hooks 与组件层语义保持不变，只需替换
  `createRouter` 内部的适配实现。

## 响应式与生命周期

适配器持有一个 `ZeusRouterSnapshot` signal。每次核心订阅回调在一个 `batch` 中发布
新的快照；`pathname`、`search`、`hash`、`matches`、`params`、`loaderData`、
`actionData`、`errors`、`navigation`、`revalidation`、`fetchers` 通过稳定 accessor
暴露。

`ZeusRouter` 只在快照对象变化时通知；`Link` 的 `href`、`aria-current` 等属性、
`Outlet` 的 route 选择都建立在 accessor 上，因此状态变化只触发对应的绑定 effect。

在 Zeus owner 内创建适配器时，`onCleanup` 自动调用 `unsubscribe` 和
`router.dispose()`。没有 active owner 时仍可显式调用 `dispose()`。

## 组件层语义

### 初始化一次

`RouterProvider`、`Link`、`Outlet` 都是普通 Zeus 组件：初始化时创建 DOM 与绑定，
之后只通过 signal 驱动的绑定更新 DOM。`Link` 不重新渲染子节点，`Outlet` 只在**目标
route 对象身份变化**时替换子树：

- 同一 route 的 params/search 变化不重建 route 子树，`useParams()` 等 accessor
  直接更新受影响绑定；
- 离开到不同 route 时，旧子树随 owner scope 释放；
- 父 route 不因叶 route 变化而重建，因此布局与列表状态在嵌套导航间保留。

### 透明 route 与透明错误边界

`Outlet` 只跳过**没有 `element` 的 route**；仅声明 `errorElement` 的 route 不能被
当作普通布局跳过，否则错误无法被该层捕获。这里的裁决是：

- 没有 `element`、也没有 `errorElement`：纯透明层，继续向下选择；
- 没有 `element`、有 `errorElement`：**透明错误边界**。健康时子路由照常渲染在它的
  位置；后代 route 失败时，该 route 的 `errorElement` 取代整段子树，并阻止更深
  `Outlet` 继续渲染；
- 有 `element`：作为下一层 DOM 边界渲染，无论是否声明 `errorElement`。

这样应用可以在保留 shell 的前提下，用一层 pathless route 为整组子路由提供统一错误
UI；只给叶子 route 声明 `errorElement` 时，边界仍只作用于该叶子。

### Link

`Link` 渲染真实 `<a>`。普通左键点击（无修饰键、未被 `defaultPrevented`、非
`download`/`target` 外链、同源）被拦截并调用 `router.navigate`，因此不使用页面
刷新。`replace`、`state`、`relative`、`preventScrollReset` 原样透传。其余属性
（`class`、`style`、`aria-*`、`data-*`、事件、`ref`）通过响应式 spread 绑定到
anchor。`preload: 'intent'` 在 hover/focus 时调用 `router.preload`。

### 错误与加载

- 导航中：`useNavigation()` 暴露 `idle` / `loading` / `submitting`，应用据此渲染
  加载状态与 `aria-busy`。
- loader/action 失败：remix 将错误传播到最近声明 `hasErrorBoundary` 的 route。
  该 route 声明了 `errorElement` 时，`Outlet` 用它替换 `element` 渲染；
  `useRouteError()` 返回对应错误。未声明 `errorElement` 的边界 route 渲染空内容并
  阻断更深 `Outlet`；仅声明 `errorElement` 的 pathless route 按上一节的透明错误边界
  处理。
- 恢复：重新导航到同一 URL（例如 `navigate(location, { replace: true })`）会重跑
  loader；成功后错误清除、原 `element` 重新挂载。

### 取消

新导航会中止进行中的导航与 fetcher 请求，loader 的 `request.signal` 触发 abort。
适配器销毁时同样中止未完成请求。

### Fetcher

`useFetcher()` 返回 Zeus 自有 accessor：`state`、`data`、`formMethod`、
`formAction`、`formData`，以及 `load(href)`、`submit(data, options)`、`cancel()`。
fetcher 以内部 key 管理，owner 释放时自动删除并中止请求。

## 预加载

浏览器中 `preload(to)` 使用核心 `router.fetch` 在 fetcher 中运行目标叶子 route 的
loader，等待完成后释放临时 key，因此不会改变当前 URL。预加载只承诺 loader 数据
预取；组件 chunk、跨请求缓存和链接 hover 策略由上层应用决定。目标没有匹配 route
id 时抛出可诊断错误。`@remix-run/router` 明确禁止 SSR router 执行 fetcher 预取，
所以服务端调用 `preload()` 会 reject 并给出核心库错误。

## 非目标与迁移规则

- 不引入 Virtual DOM、组件 rerender 或自建 route matcher。
- 不把 `@remix-run/router` 的 `RouterState` 直接变成 Zeus 公共响应式契约
  （初版非目标，2026-11-01 起落实为 Zeus 自有类型）。
- 不保留旧 router alias、兼容入口或 deprecated fallback。
- 不把 `@remix-run/router` 类型、`Router` 实例或 fetcher key 暴露为公共 API。
- SSR 只使用显式 memory history；服务端静态数据查询和 hydration 属于
  E-005/E-006，不由本 adapter 提供。
