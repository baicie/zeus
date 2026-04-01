# @zeus-js/router 重新设计方案

> 基于 vue-router 设计理念，结合 Zeus 框架特性的路由包重新设计

## 目录

- [1. 设计背景与目标](#1-设计背景与目标)
- [2. vue-router 核心设计分析](#2-vuerouter-核心设计分析)
- [3. 整体架构设计](#3-整体架构设计)
- [4. 核心模块详细设计](#4-核心模块详细设计)
- [5. 与当前实现的对比](#5-与当前实现的对比)
- [6. 文件结构](#6-文件结构)
- [7. 实现路线图](#7-实现路线图)

---

## 1. 设计背景与目标

### 1.1 当前实现问题

当前 `@zeus-js/router` 包使用类似 react-router 的组件注册方式，与 Zeus 团队期望的 vue-router 风格不一致。

| 问题 | 说明 |
|------|------|
| **使用方式不符合预期** | 用户期望类似 vue-router 的配置数组方式，而非组件注册 |
| **Route 组件冗余** | `<Route>` 组件作为路由定义是 react-router 风格，不符合项目定位 |
| **耦合度高** | Router 组件同时负责创建 router 和接收路由定义，职责不清晰 |
| **不够直观** | 配置数组方式更符合直觉，便于阅读和维护 |

### 1.2 设计目标

基于 vue-router 的成功实践，重新设计 Zeus Router：

| 目标 | 说明 |
|------|------|
| **配置数组优先** | 使用 routes 配置数组定义路由，类似 vue-router |
| **职责分离** | `createRouter` 接收配置，`Router` 组件仅负责挂载 |
| **Signal 驱动响应式** | 充分利用 alien-signal 的细粒度响应式 |
| **完整的 History 支持** | 支持 BrowserRouter、HashRouter、MemoryRouter、StaticRouter |
| **简洁的 RouterView** | 专注于渲染匹配的组件 |

---

## 2. vue-router 核心设计分析

### 2.1 核心设计理念

vue-router 的成功来自于以下核心设计：

#### 2.1.1 配置数组方式

```typescript
// vue-router 的使用方式
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/users/:id', component: UserDetail }
  ]
})

// 嵌套路由
const routes = [
  {
    path: '/users',
    component: UserLayout,
    children: [
      { path: '', component: UserList },
      { path: ':id', component: UserDetail }
    ]
  }
]
```

**配置数组优势**：
- 直观易懂：路由定义一目了然
- 易于管理：集中式配置，便于维护
- 便于序列化：可以轻松序列化/反序列化
- 支持懒加载：直接使用 `() => import('./views/About.vue')`
- TypeScript 友好：类型定义清晰

#### 2.1.2 Router + RouterView 分离

```
┌─────────────────────────────────────────────────────────────────┐
│                     Router + RouterView 模式                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Router 组件（旧）:                                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  function Router(props) {                                   │ │
│  │    const router = createRouter({ routes: [...], ... })      │ │
│  │    return (                                                 │ │
│  │      <RouterContext.Provider value={router}>                │ │
│  │        {props.children}  // Route 组件定义                    │ │
│  │      </RouterContext.Provider>                              │ │
│  │    )                                                         │ │
│  │  }                                                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Router + RouterView 模式（新）:                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  // 创建 router                                             │ │
│  │  const router = createRouter({                              │ │
│  │    history: createWebHistory(),                              │ │
│  │    routes: [                                                │ │
│  │      { path: '/', component: Home },                        │ │
│  │      { path: '/users/:id', component: User }                │ │
│  │    ]                                                        │ │
│  │  })                                                         │ │
│  │                                                              │ │
│  │  // App 组件                                                 │ │
│  │  function App() {                                           │ │
│  │    return (                                                 │ │
│  │      <RouterProvider router={router}>                       │ │
│  │        <RouterView />                                        │ │
│  │      </RouterProvider>                                       │ │
│  │    )                                                         │ │
│  │  }                                                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**分离优势**：
- 职责清晰：RouterProvider 管理状态，RouterView 负责渲染
- 灵活性高：可以在任意位置使用多个 RouterView
- 可测试性强：router 和 组件独立测试

#### 2.1.3 抽象的 History 集成

```typescript
// vue-router 的 History 抽象
export interface History {
  // 当前路径
  location: string
  // 历史记录栈
  history: HistoryState
  // 导航方法
  push(to: To): Promise<Navigation>
  replace(to: To): Promise<Navigation>
  go(delta: number): Promise<Navigation>
  back(): Promise<Navigation>
  forward(): Promise<Navigation>
  // 监听变化
  listen(callback: NavigationGuardHook): () => void
}
```

不同的 History 实现：
- `createWebHistory`: 使用 HTML5 History API
- `createHashHistory`: 使用 URL hash
- `createMemoryHistory`: 使用内存（测试用）

---

## 3. 整体架构设计

### 3.1 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         @zeus-js/router 整体架构                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                         入口层 (src/index.ts)                          │   │
│  │                                                                        │   │
│  │  // 创建函数                                                           │   │
│  │  export { createRouter }                                              │   │
│  │  export { createWebHistory, createHashHistory, createMemoryHistory }  │   │
│  │                                                                        │   │
│  │  // 组件                                                                │   │
│  │  export { RouterProvider, RouterView }                                │   │
│  │  export { RouterLink }                                                │   │
│  │                                                                        │   │
│  │  // Hooks                                                              │   │
│  │  export { useRouter, useRoute, useParams, useNavigate, useLocation }  │   │
│  │                                                                        │   │
│  │  // 类型                                                                │   │
│  │  export type { Router, RouteRecordRaw, RouteLocationNormalized }     │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                      History 层 (src/history/)                         │   │
│  │                                                                        │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │   │
│  │  │ createWebHistory │  │ createHashHistory│  │ createMemoryHistory│   │   │
│  │  │                 │  │                 │  │                   │        │   │
│  │  │ - window.history│  │ - URL hash     │  │ - 内存状态       │        │   │
│  │  │ - popstate     │  │ - hashchange   │  │ - 可测试        │        │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘        │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                      路由匹配层 (src/routing.ts)                        │   │
│  │                                                                        │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │   │
│  │  │  createRouteRecordMatcher │  │   createRouteMatcher │  │  matchRouteWild  │   │   │
│  │  │                 │  │                 │  │                 │        │   │
│  │  │ - 路由记录解析  │  │ - 单路由匹配   │  │ - 通配符匹配   │        │   │
│  │  │ - 嵌套处理     │  │ - 参数提取     │  │ - 剩余路径     │        │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘        │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                       Context 层 (src/context.ts)                       │   │
│  │                                                                        │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                              │   │
│  │  │  RouterContext  │  │  RouteContext   │                              │   │
│  │  │                 │  │                 │                              │   │
│  │  │ - 全局路由状态 │  │ - 当前路由记录  │                              │   │
│  │  │ - 导航函数    │  │ - matched 路由  │                              │   │
│  │  └─────────────────┘  └─────────────────┘                              │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│                                    ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                       组件层 (src/components/)                         │   │
│  │                                                                        │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │   │
│  │  │ RouterProvider  │  │   RouterView    │  │   RouterLink    │        │   │
│  │  │                 │  │                 │  │                 │        │   │
│  │  │ - 提供 Context │  │ - 渲染匹配组件 │  │ - 路由导航链接  │        │   │
│  │  │ - 管理 router  │  │ - 嵌套视图     │  │ - 激活状态检测  │        │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘        │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                      路由导航数据流                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 创建阶段                                                    │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │  const router = createRouter({                           │ │
│     │    history: createWebHistory(),                          │ │
│     │    routes: [...]                                          │ │
│     │  })                                                       │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                  │
│  2. 渲染阶段                                                    │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │  <RouterProvider router={router}>                        │ │
│     │    <RouterView />                                        │ │
│     │  </RouterProvider>                                       │ │
│     │                                                          │ │
│     │  RouterProvider                                          │ │
│     │    └── 创建 RouterContext                                 │ │
│     │    └── 匹配初始路由                                       │ │
│     │                                                          │ │
│     │  RouterView                                              │ │
│     │    └── 读取 currentRoute                                 │ │
│     │    └── 渲染 matched.component                            │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                  │
│  3. 导航阶段                                                    │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │  router.push('/users/123')                              │ │
│     │       │                                                  │ │
│     │       ▼                                                  │ │
│     │  history.push('/users/123')                             │ │
│     │       │                                                  │ │
│     │       ▼                                                  │ │
│     │  触发 popstate / hashchange 事件                         │ │
│     │       │                                                  │ │
│     │       ▼                                                  │ │
│     │  router.matchRoute('/users/123')                         │ │
│     │       │                                                  │ │
│     │       ▼                                                  │ │
│     │  更新 currentRoute Signal                                │ │
│     │       │                                                  │ │
│     │       ▼                                                  │ │
│     │  RouterView 自动重新渲染                                 │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 路由匹配流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      路由匹配流程                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 路由配置阶段                                                │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │  const routes = [                                       │ │
│     │    { path: '/', component: Home },                      │ │
│     │    {                                                     │ │
│     │      path: '/users',                                     │ │
│     │      component: UserLayout,                             │ │
│     │      children: [                                         │ │
│     │        { path: '', component: UserList },                │ │
│     │        { path: ':id', component: UserDetail }            │ │
│     │      ]                                                    │ │
│     │    }                                                      │ │
│     │  ]                                                        │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                  │
│  2. 路由匹配阶段                                                │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │  URL: /users/123                                         │ │
│     │                                                          │ │
│     │  router.matchRoute('/users/123')                        │ │
│     │    │                                                     │ │
│     │    ├── /users (UserLayout)                              │ │
│     │    │       └── children/:id (UserDetail)                  │ │
│     │    │           └── ✓ params: { id: '123' }              │ │
│     │    │                                                     │ │
│     │    └── / (Home)                                          │ │
│     │            └── ✗ 不匹配 /users                           │ │
│     │                                                          │ │
│     │  返回 matched: [UserLayout, UserDetail]                 │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                  │
│  3. 嵌套渲染阶段                                                │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │  RouterView (根)                                         │ │
│     │    │                                                     │ │
│     │    └── 渲染 UserLayout                                   │ │
│     │          │                                               │ │
│     │          └── <RouterView /> (嵌套)                        │ │
│     │                │                                         │ │
│     │                └── 渲染 UserDetail                        │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 核心模块详细设计

### 4.1 路由记录类型 (`src/types.ts`)

```typescript
// src/types.ts
// ============================================================================
// 路由类型定义
// ============================================================================

import type { Component } from '@zeus-js/runtime-dom'

// ============================================================================
// 路由记录
// ============================================================================

/** 路由记录类型 */
export type RouteRecordRaw =
  | RouteRecordSingle
  | RouteRecordMultiple

/** 单一路由记录 */
export interface RouteRecordSingle {
  /** 路由路径 */
  path: string
  /** 路由名称 */
  name?: string
  /** 路由组件 */
  component?: Component
  /** 懒加载组件 */
  componentAsync?: () => Promise<Component>
  /** 子路由 */
  children?: RouteRecordRaw[]
  /** 路由元信息 */
  meta?: Record<string, unknown>
  /** 路由别名 */
  alias?: string | string[]
  /** 路由重定向 */
  redirect?: string | RouteLocationNormalized
  /** beforeEnter 守卫 */
  beforeEnter?: NavigationGuard
  /** 滚动行为 */
  scrollBehavior?: ScrollBehavior
}

/** 多视图路由记录 */
export interface RouteRecordMultiple {
  /** 路径 */
  path: string
  /** 多视图配置 */
  components?: {
    default?: Component
    [name: string]: Component | undefined
  }
  /** 懒加载多视图 */
  componentsAsync?: {
    default?: () => Promise<Component>
    [name: string]: (() => Promise<Component>) | undefined
  }
  /** 子路由 */
  children?: RouteRecordRaw[]
  /** 其他配置 */
  meta?: Record<string, unknown>
  redirect?: string
}

// ============================================================================
// 路由参数
// ============================================================================

/** 路由参数 */
export type Params = Record<string, string | string[]>

/** 路径参数类型推导 */
export type PathParams<P extends string> =
  P extends `${infer _Head}/${infer _Tail}`
    ? [...PathParams<_Head>, ...PathParams<_Tail>]
    : P extends `:${infer _S}?`
      ? [_S]
      : P extends `:${infer _S}`
        ? [_S]
        : P extends `*${infer _S}`
          ? [_S]
          : []

// ============================================================================
// Location
// ============================================================================

/** Route Location */
export interface RouteLocation {
  /** 完整路径 */
  fullPath: string
  /** 路径 */
  path: string
  /** 查询参数 */
  query: Record<string, string | string[] | null>
  /** Hash */
  hash: string
  /** 参数 */
  params: Params
  /** 路由名称 */
  name?: string
  /** 匹配的路由记录 */
  matched: RouteRecord[]
}

/** 规范化的路由位置 */
export interface RouteLocationNormalized extends RouteLocation {
  /** 来源 */
  redirectedFrom?: string
  /** Meta */
  meta?: Record<string, unknown>
}

// ============================================================================
// History
// ============================================================================

/** History 状态 */
export interface HistoryState {
  [key: string]: unknown
}

/** History 类型 */
export type HistoryMode = 'history' | 'hash' | 'memory' | 'abstract'

/** Navigation 类型 */
export type NavigationType = 'push' | 'replace' | 'pop'

// ============================================================================
// Router
// ============================================================================

/** Router 选项 */
export interface RouterOptions {
  /** History 实例 */
  history: History
  /** 路由配置 */
  routes: RouteRecordRaw[]
  /** 基础路径 */
  base?: string
  /** 滚动行为 */
  scrollBehavior?: ScrollBehavior
  /** 是否启用严格模式 */
  strict?: boolean
}

/** Router 实例 */
export interface Router {
  /** 当前路由 */
  readonly currentRoute: Signal<RouteLocationNormalized>
  /** History 实例 */
  readonly history: History
  /** 路由配置 */
  readonly routes: RouteRecordRaw[]

  /** 导航到指定路径 */
  push(to: RouteLocationRaw): Promise<NavigationFailure | void>
  /** 替换当前路径 */
  replace(to: RouteLocationRaw): Promise<NavigationFailure | void>
  /** 历史记录前进/后退 */
  go(delta: number): void
  /** 后退 */
  back(): void
  /** 前进 */
  forward(): void
  /** 添加路由 */
  addRoute(parentName: string, route: RouteRecordRaw): void
  /** 获取路由 */
  getRoutes(): RouteRecord[]
  /** 获取路由 by name */
  getRoute(name: string): RouteRecord | undefined

  /** 匹配路由 */
  resolve(to: RouteLocationRaw): RouteLocationNormalized
  /** 安装插件 */
  install(app: App): void
}

// ============================================================================
// Signal
// ============================================================================

/** Signal 类型 */
export type Signal<T> = {
  (): T
  (value: T): T
}
```

### 4.2 History 模块 (`src/history/`)

```typescript
// src/history/base.ts
// ============================================================================
// History 基类
// ============================================================================

import { signal } from '@zeus-js/signal'
import type { Signal } from '@zeus-js/signal'

/** History 配置 */
export interface HistoryState {
  value: string
  name?: string
}

/** History 选项 */
export interface HistoryOptions {
  /** 基础路径 */
  base?: string
}

/** Navigation 事件 */
export interface NavigationEvent {
  type: 'push' | 'replace' | 'pop'
  from: string
  to: string
  index: number
}

/** Navigation 回调 */
export type NavigationCallback = (event: NavigationEvent) => void

/**
 * 创建 History 基类
 */
export function createBaseHistory(options: HistoryOptions = {}) {
  const { base = '' } = options

  // 当前路径
  const current = signal<string>('')

  // 历史记录栈
  const stack: string[] = []
  const index = signal<number>(-1)

  // 监听器
  const listeners: NavigationCallback[] = []

  // 解析路径
  function resolvePath(to: string): string {
    // 已经是绝对路径
    if (to.startsWith('/')) {
      return to
    }
    // 相对路径处理
    const currentPath = current()
    const segments = currentPath.split('/').filter(Boolean)
    segments.pop()

    for (const part of to.split('/')) {
      if (part === '..') {
        segments.pop()
      } else if (part !== '.' && part !== '') {
        segments.push(part)
      }
    }

    return '/' + segments.join('/')
  }

  // 导航
  function navigate(to: string, type: 'push' | 'replace' = 'push') {
    const resolved = resolvePath(to)
    const from = current()

    if (resolved === from) {
      return
    }

    current(resolved)

    if (type === 'push') {
      // 清理当前位置之后的历史
      if (index() < stack.length - 1) {
        stack.length = index() + 1
      }
      stack.push(resolved)
      index(stack.length - 1)
    }

    // 触发监听器
    const event: NavigationEvent = {
      type,
      from,
      to: resolved,
      index: index()
    }

    for (const listener of listeners) {
      listener(event)
    }
  }

  // 监听
  function listen(callback: NavigationCallback): () => void {
    listeners.push(callback)
    return () => {
      const idx = listeners.indexOf(callback)
      if (idx > -1) {
        listeners.splice(idx, 1)
      }
    }
  }

  return {
    get current() {
      return current()
    },
    get location() {
      return current()
    },
    get index() {
      return index()
    },
    get base() {
      return base
    },
    resolvePath,
    push(to: string) {
      navigate(to, 'push')
    },
    replace(to: string) {
      navigate(to, 'replace')
    },
    go(delta: number) {
      const newIndex = index() + delta
      if (newIndex < 0 || newIndex >= stack.length) {
        return
      }
      index(newIndex)
      current(stack[newIndex])

      for (const listener of listeners) {
        listener({
          type: 'pop',
          from: stack[index()],
          to: stack[newIndex],
          index: newIndex
        })
      }
    },
    back() {
      this.go(-1)
    },
    forward() {
      this.go(1)
    },
    listen
  }
}

// ============================================================================
// Browser History
// ============================================================================

import { createBaseHistory } from './base'

export interface BrowserHistoryOptions extends HistoryOptions {
  window?: Window
}

export function createWebHistory(options: BrowserHistoryOptions = {}) {
  const base = createBaseHistory(options)
  const window = options.window || globalThis.window

  // 初始化
  function init() {
    base.push(window.location.pathname + window.location.search + window.location.hash)
  }

  // 监听 popstate
  function onPopState() {
    const url = window.location.pathname + window.location.search + window.location.hash
    if (url !== base.current) {
      base.go(-1) // 让 base 处理，但这里是浏览器触发的
    }
  }

  // 监听器清理
  let cleanup: (() => void) | undefined

  return {
    ...base,
    get location() {
      return window.location.pathname + window.location.search + window.location.hash
    },
    push(to: string) {
      window.history.pushState(null, '', to)
      base.push(to)
    },
    replace(to: string) {
      window.history.replaceState(null, '', to)
      base.replace(to)
    },
    onPopState,
    init() {
      init()
      window.addEventListener('popstate', onPopState)
      cleanup = () => {
        window.removeEventListener('popstate', onPopState)
      }
    },
    destroy() {
      cleanup?.()
    }
  }
}

// ============================================================================
// Hash History
// ============================================================================

export function createHashHistory(options: HistoryOptions = {}) {
  const base = createBaseHistory(options)

  function getHash(): string {
    const window = globalThis.window
    const href = window.location.href
    const index = href.indexOf('#')
    return index > -1 ? href.slice(index + 1) : ''
  }

  function getUrl(hash: string): string {
    const window = globalThis.window
    const href = window.location.href
    const index = href.indexOf('#')
    return index > -1 ? href.slice(0, index) : href + '#'
  }

  function onHashChange() {
    const hash = getHash()
    if (hash !== base.current) {
      base.push(hash)
    }
  }

  let cleanup: (() => void) | undefined

  return {
    ...base,
    get location() {
      return getHash()
    },
    push(to: string) {
      const hash = to.startsWith('#') ? to.slice(1) : to
      window.location.hash = hash
      base.push(hash)
    },
    replace(to: string) {
      const hash = to.startsWith('#') ? to.slice(1) : to
      const url = getUrl(hash)
      window.history.replaceState(null, '', url)
      base.replace(hash)
    },
    init() {
      init()
      window.addEventListener('hashchange', onHashChange)
      cleanup = () => {
        window.removeEventListener('hashchange', onHashChange)
      }
    },
    destroy() {
      cleanup?.()
    }
  }
}

// ============================================================================
// Memory History
// ============================================================================

export function createMemoryHistory(options: HistoryOptions = {}) {
  const base = createBaseHistory(options)
  const routes: string[] = []

  return {
    ...base,
    push(to: string) {
      base.push(to)
      routes.push(to)
    },
    replace(to: string) {
      base.replace(to)
      if (routes.length > 0) {
        routes[routes.length - 1] = to
      } else {
        routes.push(to)
      }
    }
  }
}
```

### 4.3 路由匹配 (`src/routing.ts`)

```typescript
// src/routing.ts
// ============================================================================
// 路由匹配
// ============================================================================

import type { RouteRecordRaw, RouteRecord, RouteLocationNormalized, Params } from './types'

// ============================================================================
// RouteRecord 规范化
// ============================================================================

/** 规范化的路由记录 */
export interface NormalizedRouteRecord {
  path: string
  regex: RegExp
  keys: string[]
  components: Record<string, unknown>
  alias: string[]
  matchAs?: string
  name?: string
  meta?: Record<string, unknown>
  children?: NormalizedRouteRecord[]
  parent?: NormalizedRouteRecord
  childrenName?: string
}

/**
 * 规范化路由记录
 */
export function normalizeRouteRecord(record: RouteRecordRaw): NormalizedRouteRecord {
  return {
    path: record.path,
    regex: pathToRegexp(record.path),
    keys: extractKeys(record.path),
    components: {
      default: (record as any).component
    },
    alias: record.alias ? (Array.isArray(record.alias) ? record.alias : [record.alias]) : [],
    matchAs: (record as any).matchAs,
    name: record.name,
    meta: record.meta
  }
}

/**
 * 路径转正则
 */
function pathToRegexp(path: string): RegExp {
  const keys: string[] = []
  const regexStr = path
    .replace(/\/\*/g, (match) => {
      if (match === '/**') {
        keys.push('__suffix__')
        return '(?:/(.*))?'
      } else {
        keys.push('__rest__')
        return '(?:/(.*))?'
      }
    })
    .replace(/:(\w+)(\?)?/g, (_, key, optional) => {
      keys.push(key)
      return optional ? `([^/]*)?` : '([^/]+)'
    })
    .replace(/\//g, '\\/')

  return new RegExp(`^${regexStr}$`)
}

/**
 * 提取路径参数名
 */
function extractKeys(path: string): string[] {
  const keys: string[] = []
  path.replace(/:(\w+)(\?)?/g, (_, key) => {
    keys.push(key)
    return _
  })
  return keys
}

// ============================================================================
// RouteMatcher
// ============================================================================

/** 路由匹配结果 */
export interface RouteMatch {
  path: string
  params: Params
  matched: NormalizedRouteRecord[]
}

/**
 * 创建路由匹配器
 */
export function createRouteMatcher(routes: RouteRecordRaw[]) {
  // 规范化所有路由
  const normalizedRoutes = flatRouteRecords(routes)

  // 排序：动态路由参数 > 静态路由
  normalizedRoutes.sort((a, b) => {
    return scoreRoute(b.path) - scoreRoute(a.path)
  })

  /**
   * 匹配路径
   */
  function matchRoute(path: string): RouteMatch | null {
    // 遍历所有路由
    for (const route of normalizedRoutes) {
      const match = matchRouteRecord(route, path)
      if (match) {
        return match
      }
    }
    return null
  }

  /**
   * 匹配单个路由记录
   */
  function matchRouteRecord(record: NormalizedRouteRecord, path: string): RouteMatch | null {
    const { regex, keys, children } = record

    // 尝试匹配
    const match = path.match(regex)
    if (!match) {
      return null
    }

    // 提取参数
    const params: Params = {}
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (key === '__suffix__' || key === '__rest__') {
        params[key] = match[i + 1] || ''
      } else {
        params[key] = decode(match[i + 1], key)
      }
    }

    // 匹配子路由
    if (children && children.length > 0) {
      const remainingPath = extractRemainingPath(path, record.path)
      if (remainingPath !== undefined) {
        for (const child of children) {
          const childMatch = matchRouteRecord(child, remainingPath)
          if (childMatch) {
            return {
              path: match[0],
              params: { ...params, ...childMatch.params },
              matched: [record, ...childMatch.matched]
            }
          }
        }
      }
    }

    return {
      path: match[0],
      params,
      matched: [record]
    }
  }

  /**
   * 提取剩余路径
   */
  function extractRemainingPath(path: string, basePath: string): string | undefined {
    if (basePath.endsWith('**')) {
      return path
    }
    if (path.startsWith(basePath)) {
      return path.slice(basePath.length) || '/'
    }
    return undefined
  }

  /**
   * 解析路径
   */
  function resolvePath(to: string, from?: string): string {
    if (to.startsWith('/')) {
      return to
    }

    const base = from || '/'
    const segments = base.split('/').filter(Boolean)
    segments.pop()

    for (const part of to.split('/')) {
      if (part === '..') {
        segments.pop()
      } else if (part !== '.') {
        segments.push(part)
      }
    }

    return '/' + segments.join('/')
  }

  return {
    matchRoute,
    resolvePath,
    routes: normalizedRoutes
  }
}

/**
 * 扁平化路由记录（处理嵌套）
 */
function flatRouteRecords(
  routes: RouteRecordRaw[],
  parent?: NormalizedRouteRecord
): NormalizedRouteRecord[] {
  const result: NormalizedRouteRecord[] = []

  for (const route of routes) {
    const record = normalizeRouteRecord(route)
    record.parent = parent

    if (route.children && route.children.length > 0) {
      const childRecords = flatRouteRecords(route.children, record)
      result.push(...childRecords)
    } else {
      result.push(record)
    }
  }

  return result
}

/**
 * 路由评分（用于排序）
 */
function scoreRoute(path: string): number {
  let score = 0
  const segments = path.split('/').filter(Boolean)

  for (const segment of segments) {
    if (segment === '**') {
      score += 1
    } else if (segment.startsWith(':')) {
      score += 3
    } else {
      score += 4
    }
  }

  return score
}

/**
 * 解码参数
 */
function decode(value: string | undefined, key: string): string {
  if (value === undefined) {
    return ''
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
```

### 4.4 createRouter (`src/createRouter.ts`)

```typescript
// src/createRouter.ts
// ============================================================================
// createRouter - Router 工厂函数
// ============================================================================

import { signal, computed, effect } from '@zeus-js/signal'
import type { Signal } from '@zeus-js/signal'

import type {
  Router,
  RouterOptions,
  RouteLocationRaw,
  RouteLocationNormalized,
  RouteRecordRaw,
  RouteRecord,
} from './types'

import { createRouteMatcher } from './routing'
import type { RouteMatch, NormalizedRouteRecord } from './routing'

// ============================================================================
// Router 创建
// ============================================================================

/**
 * 创建 Router
 *
 * @param options Router 选项
 * @returns Router 实例
 *
 * @example
 * ```typescript
 * const router = createRouter({
 *   history: createWebHistory(),
 *   routes: [
 *     { path: '/', component: Home },
 *     { path: '/users/:id', component: User }
 *   ]
 * })
 *
 * // 在 App 中使用
 * function App() {
 *   return (
 *     <RouterProvider router={router}>
 *       <RouterView />
 *     </RouterProvider>
 *   )
 * }
 * ```
 */
export function createRouter(options: RouterOptions): Router {
  const { history, routes, base = '' } = options

  // 创建路由匹配器
  const matcher = createRouteMatcher(routes)

  // 当前路由 Signal
  const currentRoute = signal<RouteLocationNormalized>({
    fullPath: '/',
    path: '/',
    query: {},
    hash: '',
    params: {},
    matched: []
  })

  // 监听 history 变化
  const stopHistoryListener = history.listen((event) => {
    const matched = matcher.matchRoute(history.location)
    if (matched) {
      currentRoute({
        fullPath: matched.path + history.location.split('?')[1] || '',
        path: matched.path,
        query: parseQuery(history.location),
        hash: extractHash(history.location),
        params: matched.params,
        matched: matched.matched
      })
    }
  })

  // 初始化
  function init() {
    history.init?.()
    const matched = matcher.matchRoute(history.location)
    if (matched) {
      currentRoute({
        fullPath: matched.path,
        path: matched.path,
        query: parseQuery(history.location),
        hash: extractHash(history.location),
        params: matched.params,
        matched: matched.matched
      })
    }
  }

  // 导航
  async function push(to: RouteLocationRaw): Promise<any> {
    const resolved = resolveTo(to)
    history.push(resolved.path)

    const matched = matcher.matchRoute(resolved.path)
    if (matched) {
      currentRoute({
        fullPath: resolved.path,
        path: matched.path,
        query: parseQuery(resolved.path),
        hash: resolved.hash || '',
        params: matched.params,
        matched: matched.matched
      })
    }
  }

  async function replace(to: RouteLocationRaw): Promise<any> {
    const resolved = resolveTo(to)
    history.replace(resolved.path)

    const matched = matcher.matchRoute(resolved.path)
    if (matched) {
      currentRoute({
        fullPath: resolved.path,
        path: matched.path,
        query: parseQuery(resolved.path),
        hash: resolved.hash || '',
        params: matched.params,
        matched: matched.matched
      })
    }
  }

  function go(delta: number): void {
    history.go(delta)
  }

  function back(): void {
    history.back()
  }

  function forward(): void {
    history.forward()
  }

  // 添加路由
  function addRoute(parentName: string, route: RouteRecordRaw): void {
    // 重新构建匹配器
    routes.push(route)
    // TODO: 重新初始化 matcher
  }

  // 获取所有路由
  function getRoutes(): RouteRecord[] {
    return matcher.routes as RouteRecord[]
  }

  // 根据 name 获取路由
  function getRoute(name: string): RouteRecord | undefined {
    return matcher.routes.find(r => r.name === name) as RouteRecord | undefined
  }

  // 解析路径
  function resolve(to: RouteLocationRaw): RouteLocationNormalized {
    const resolved = resolveTo(to)
    const matched = matcher.matchRoute(resolved.path) || {
      path: resolved.path,
      params: {},
      matched: []
    }

    return {
      fullPath: resolved.path,
      path: matched.path,
      query: parseQuery(resolved.path),
      hash: resolved.hash || '',
      params: matched.params,
      matched: matched.matched,
      name: resolved.name
    }
  }

  // 解析目标路径
  function resolveTo(to: RouteLocationRaw): {
    path: string
    hash?: string
    name?: string
    query?: Record<string, string | string[] | null>
  } {
    if (typeof to === 'string') {
      return { path: to }
    }
    return {
      path: to.path || '',
      hash: to.hash,
      name: to.name,
      query: to.query
    }
  }

  // 安装
  function install(app: any): void {
    // TODO: 提供全局属性
  }

  // 清理
  function destroy() {
    stopHistoryListener()
    history.destroy?.()
  }

  return {
    get currentRoute() {
      return currentRoute
    },
    get history() {
      return history
    },
    get routes() {
      return routes
    },
    push,
    replace,
    go,
    back,
    forward,
    addRoute,
    getRoutes,
    getRoute,
    resolve,
    install,
    destroy,
    init
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 解析查询参数
 */
function parseQuery(url: string): Record<string, string | string[] | null> {
  const query: Record<string, string | string[] | null> = {}
  const idx = url.indexOf('?')
  if (idx === -1) return query

  const search = url.slice(idx + 1)
  if (!search) return query

  const hashIdx = search.indexOf('#')
  const queryStr = hashIdx > -1 ? search.slice(0, hashIdx) : search

  for (const pair of queryStr.split('&')) {
    const [key, value = ''] = pair.split('=')
    if (!key) continue

    const decodedKey = decodeURIComponent(key)
    const decodedValue = decodeURIComponent(value)

    if (query[decodedKey]) {
      if (Array.isArray(query[decodedKey])) {
        (query[decodedKey] as string[]).push(decodedValue)
      } else {
        query[decodedKey] = [query[decodedKey] as string, decodedValue]
      }
    } else {
      query[decodedKey] = decodedValue
    }
  }

  return query
}

/**
 * 提取 hash
 */
function extractHash(url: string): string {
  const idx = url.indexOf('#')
  return idx > -1 ? url.slice(idx + 1) : ''
}
```

### 4.5 RouterProvider 组件 (`src/components/RouterProvider.tsx`)

```typescript
// src/components/RouterProvider.tsx
// ============================================================================
// RouterProvider 组件
// ============================================================================

import type { JSXElement } from '@zeus-js/runtime-dom'

import { RouterContext } from '../context'
import type { Router } from '../types'

// ============================================================================
// Props
// ============================================================================

export interface RouterProviderProps {
  /** Router 实例 */
  router: Router
  /** 子元素 */
  children?: JSXElement
}

// ============================================================================
// RouterProvider
// ============================================================================

/**
 * RouterProvider 组件
 *
 * 将 Router 实例注入到 Context 中
 *
 * @example
 * ```tsx
 * const router = createRouter({ ... })
 *
 * function App() {
 *   return (
 *     <RouterProvider router={router}>
 *       <Layout />
 *     </RouterProvider>
 *   )
 * }
 * ```
 */
export function RouterProvider(props: RouterProviderProps): JSXElement {
  return (
    <RouterContext.Provider value={props.router}>
      {props.children}
    </RouterContext.Provider>
  )
}
```

### 4.6 RouterView 组件 (`src/components/RouterView.tsx`)

```typescript
// src/components/RouterView.tsx
// ============================================================================
// RouterView 组件
// ============================================================================

import { computed } from '@zeus-js/signal'
import type { JSXElement } from '@zeus-js/runtime-dom'

import { useRouterContext, useRouteContext } from '../context'

// ============================================================================
// RouterView
// ============================================================================

/**
 * RouterView 组件
 *
 * 渲染当前匹配的路由组件
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <RouterProvider router={router}>
 *       <RouterView />
 *     </RouterProvider>
 *   )
 * }
 * ```
 */
export function RouterView(): JSXElement {
  const router = useRouterContext()
  const parentRoute = useRouteContext()

  // 当前匹配的路由
  const matchedRoute = computed(() => {
    const current = router.currentRoute()
    if (!current.matched || current.matched.length === 0) {
      return null
    }

    // 如果有父路由，找到当前嵌套层级的路由
    if (parentRoute) {
      const parentIndex = current.matched.findIndex(
        m => m.path === parentRoute.path
      )
      if (parentIndex > -1 && current.matched[parentIndex + 1]) {
        return current.matched[parentIndex + 1]
      }
      return null
    }

    // 根路由
    return current.matched[0]
  })

  // 渲染组件
  const component = computed(() => {
    const route = matchedRoute()
    if (!route) {
      return null
    }

    // 获取组件
    const comp = route.components?.default || (route as any).component
    if (!comp) {
      return null
    }

    return comp
  })

  // 获取组件 props
  const routeProps = computed(() => {
    const current = router.currentRoute()
    return {
      params: current.params,
      location: {
        pathname: current.path,
        search: current.fullPath.split('?')[1] || '',
        hash: current.hash,
        query: current.query
      }
    }
  })

  // 渲染
  const comp = component()
  if (!comp) {
    return null
  }

  return comp(routeProps()) as JSXElement
}
```

### 4.7 RouterLink 组件 (`src/components/RouterLink.tsx`)

```typescript
// src/components/RouterLink.tsx
// ============================================================================
// RouterLink 组件
// ============================================================================

import { computed } from '@zeus-js/signal'
import type { JSXElement } from '@zeus-js/runtime-dom'

import { useRouterContext } from '../context'
import type { RouteLocationRaw } from '../types'

// ============================================================================
// Props
// ============================================================================

export interface RouterLinkProps {
  /** 链接目标 */
  to: RouteLocationRaw
  /** 替换历史记录 */
  replace?: boolean
  /** 自定义标签 */
  tag?: string
  /** 自定义类名 */
  class?: string
  /** 激活状态类名 */
  activeClass?: string
  /** 完全匹配激活类名 */
  exactActiveClass?: string
  /** 事件处理前回调 */
  event?: string | string[]
  /** 子元素 */
  children?: JSXElement
}

// ============================================================================
// RouterLink
// ============================================================================

/**
 * RouterLink 组件
 *
 * 支持编程式导航的链接组件
 *
 * @example
 * ```tsx
 * // 字符串形式
 * <RouterLink to="/users">Users</RouterLink>
 *
 * // 对象形式
 * <RouterLink to={{ path: '/users', query: { page: 1 } }}>Users</RouterLink>
 * ```
 */
export function RouterLink(props: RouterLinkProps): JSXElement {
  const router = useRouterContext()

  // 解析目标路径
  const toPath = computed(() => {
    if (typeof props.to === 'string') {
      return props.to
    }
    let path = props.to.path || ''
    if (props.to.query) {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(props.to.query)) {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            for (const v of value) {
              query.append(key, v)
            }
          } else {
            query.set(key, value)
          }
        }
      }
      const queryStr = query.toString()
      if (queryStr) {
        path += '?' + queryStr
      }
    }
    if (props.to.hash) {
      path += '#' + props.to.hash
    }
    return path
  })

  // 检查激活状态
  const isActive = computed(() => {
    const current = router.currentRoute()
    return current.path.startsWith(toPath())
  })

  const isExactActive = computed(() => {
    const current = router.currentRoute()
    return current.path === toPath()
  })

  // 计算类名
  const className = computed(() => {
    const classes = [props.class].filter(Boolean)

    if (isExactActive() && props.exactActiveClass) {
      classes.push(props.exactActiveClass)
    } else if (isActive() && props.activeClass) {
      classes.push(props.activeClass)
    }

    return classes.join(' ') || undefined
  })

  // 点击处理
  const handleClick = (e: MouseEvent) => {
    // 忽略外部链接、修饰键点击等
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.altKey ||
      e.ctrlKey ||
      e.shiftKey
    ) {
      return
    }

    e.preventDefault()

    // 导航
    if (props.replace) {
      router.replace(props.to)
    } else {
      router.push(props.to)
    }
  }

  const Tag = (props.tag as any) || 'a'

  return (
    <Tag
      href={toPath()}
      class={className()}
      onClick={handleClick}
    >
      {props.children}
    </Tag>
  )
}
```

### 4.8 Hooks (`src/hooks.ts`)

```typescript
// src/hooks.ts
// ============================================================================
// Router Hooks
// ============================================================================

import { useRouterContext, useRouteContext } from './context'
import type { RouteLocationNormalized, RouteRecordRaw, Params } from './types'

// ============================================================================
// Hooks
// ============================================================================

/**
 * 获取 router 实例
 */
export function useRouter(): any {
  return useRouterContext()
}

/**
 * 获取当前路由
 *
 * @example
 * ```tsx
 * function User() {
 *   const route = useRoute()
 *   return <div>Path: {route.path}</div>
 * }
 * ```
 */
export function useRoute(): RouteLocationNormalized {
  return useRouter().currentRoute()
}

/**
 * 获取路由参数
 *
 * @example
 * ```tsx
 * function User() {
 *   const params = useParams()
 *   return <div>User ID: {params.id}</div>
 * }
 * ```
 */
export function useParams<T extends Params = Params>(): T {
  const route = useRoute()
  return route.params as T
}

/**
 * 获取 location
 *
 * @example
 * ```tsx
 * function Component() {
 *   const location = useLocation()
 *   return <div>Path: {location.path}</div>
 * }
 * ```
 */
export function useLocation(): RouteLocationNormalized {
  return useRoute()
}

/**
 * 获取 navigate 函数
 *
 * @example
 * ```tsx
 * function Component() {
 *   const navigate = useNavigate()
 *
 *   const handleClick = () => {
 *     navigate('/users')
 *   }
 *
 *   return <button onClick={handleClick}>Go</button>
 * }
 * ```
 */
export function useNavigate(): (to: RouteLocationRaw, options?: { replace?: boolean }) => void {
  const router = useRouter()
  return (to: RouteLocationRaw, options?: { replace?: boolean }) => {
    if (options?.replace) {
      router.replace(to)
    } else {
      router.push(to)
    }
  }
}

/**
 * 检查是否正在路由切换
 */
export function useIsRouting(): () => boolean {
  const router = useRouter()
  return () => {
    // TODO: 实现
    return false
  }
}
```

### 4.9 入口文件 (`src/index.ts`)

```typescript
// src/index.ts
// ============================================================================
// @zeus-js/router 入口
// ============================================================================

// History 工厂函数
export { createWebHistory } from './history/createWebHistory'
export { createHashHistory } from './history/createHashHistory'
export { createMemoryHistory } from './history/createMemoryHistory'

// Router 工厂函数
export { createRouter } from './createRouter'

// 组件
export { RouterProvider } from './components/RouterProvider'
export { RouterView } from './components/RouterView'
export { RouterLink } from './components/RouterLink'

// 兼容性别名（vue-router 风格）
export { RouterView as View } from './components/RouterView'
export { RouterLink as Link } from './components/RouterLink'

// Hooks
export {
  useRouter,
  useRoute,
  useParams,
  useLocation,
  useNavigate,
  useIsRouting,
} from './hooks'

// 类型
export type {
  Router,
  RouterOptions,
  RouteRecordRaw,
  RouteRecordSingle,
  RouteRecordMultiple,
  RouteLocationRaw,
  RouteLocationNormalized,
  RouteLocation,
  HistoryState,
  History,
  Params,
  NavigationFailure,
} from './types'

// 兼容性别名
export type {
  RouteRecord as RouteConfig,
  RouteLocationNormalized as Route,
} from './types'
```

---

## 5. 与当前实现的对比

### 5.1 API 对比

| 方面 | 当前实现 (react-router 风格) | 新实现 (vue-router 风格) |
|------|----------|--------|
| **路由定义** | `<Route path="/" component={Home} />` | `routes: [{ path: '/', component: Home }]` |
| **Router 组件** | `<Router><Route ... /></Router>` | `<RouterProvider router={router}>` |
| **视图渲染** | `<Routes />` | `<RouterView />` |
| **路由匹配** | Route 组件收集定义 | 配置数组直接匹配 |
| **嵌套路由** | JSX 嵌套 `<Route>` | children 数组 |
| **路由创建** | Router 组件内部创建 | 独立 `createRouter()` |

### 5.2 使用方式对比

**当前实现（react-router 风格）**：
```tsx
import { Router, Route, Link } from '@zeus-js/router'

function App() {
  return (
    <Router root={Layout}>
      <Route path="/" component={Home} />
      <Route path="/users/:id" component={User} />
    </Router>
  )
}
```

**新实现（vue-router 风格）**：
```tsx
import { createRouter, RouterProvider, RouterView, RouterLink } from '@zeus-js/router'

// 创建 router（可以在模块顶层）
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/users/:id', component: User }
  ]
})

function App() {
  return (
    <RouterProvider router={router}>
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/users/123">User</RouterLink>
      </nav>
      <RouterView />
    </RouterProvider>
  )
}
```

### 5.3 新实现的优势

1. **更直观**：配置数组比 JSX 嵌套更清晰
2. **职责分离**：Router 实例和组件分离
3. **易于测试**：路由配置可以独立测试
4. **符合预期**：与 vue-router 风格一致
5. **支持懒加载**：直接使用 `componentAsync`
6. **更好的 TypeScript 支持**：类型定义更清晰

---

## 6. 文件结构

```
addons/router/src/
├── index.ts                      # 入口文件
│
├── types.ts                      # 类型定义
│
├── context.ts                    # Context 定义
│
├── history/
│   ├── base.ts                   # History 基类
│   ├── createWebHistory.ts       # Browser History
│   ├── createHashHistory.ts      # Hash History
│   └── createMemoryHistory.ts    # Memory History
│
├── routing.ts                    # 路由匹配逻辑
│
├── createRouter.ts              # Router 工厂函数
│
├── components/
│   ├── RouterProvider.tsx       # Router Provider 组件
│   ├── RouterView.tsx           # 路由视图组件
│   └── RouterLink.tsx           # 链接组件
│
├── hooks.ts                      # Hooks 导出
└── utils.ts                      # 工具函数
```

---

## 7. 实现路线图

### 7.1 阶段 1：核心重构（预计 2 天）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 重写 types.ts | P0 | 新的类型定义 |
| 实现 History 模块 | P0 | base, web, hash, memory |
| 实现 routing.ts | P0 | 路由匹配逻辑 |
| 实现 createRouter | P0 | Router 工厂函数 |

### 7.2 阶段 2：组件开发（预计 1 天）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 实现 RouterProvider | P0 | Context Provider |
| 实现 RouterView | P0 | 路由视图渲染 |
| 实现 RouterLink | P0 | 链接组件 |

### 7.3 阶段 3：Hooks 和入口（预计 0.5 天）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 实现 Hooks | P0 | useRouter, useRoute 等 |
| 更新 index.ts | P0 | 导出新 API |
| 删除旧的 Route 组件 | P0 | 不再需要 |

### 7.4 阶段 4：测试和示例（预计 1 天）

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 更新 playground | P0 | 新 API 使用示例 |
| 编写单元测试 | P1 | 路由匹配测试 |

---

## 附录 A：API 参考

### A.1 createRouter

```typescript
const router = createRouter({
  history: createWebHistory(),  // 或 createHashHistory, createMemoryHistory
  routes: [
    { path: '/', component: Home },
    { path: '/users', component: Users, children: [
      { path: '', component: UserList },
      { path: ':id', component: UserDetail }
    ]}
  ]
})
```

### A.2 History

```typescript
// Browser History
const history = createWebHistory()

// Hash History
const history = createHashHistory()

// Memory History (测试用)
const history = createMemoryHistory()
```

### A.3 组件

```tsx
// RouterProvider
<RouterProvider router={router}>
  {children}
</RouterProvider>

// RouterView
<RouterView />

// RouterLink
<RouterLink to="/users">Users</RouterLink>
<RouterLink to={{ path: '/users', query: { page: 1 } }}>Users</RouterLink>
```

### A.4 Hooks

```typescript
const router = useRouter()
const route = useRoute()
const params = useParams<{ id: string }>()
const location = useLocation()
const navigate = useNavigate()
```

---

## 附录 B：迁移指南

### B.1 从当前实现迁移

**旧代码**：
```tsx
import { Router, Route, Link } from '@zeus-js/router'

function App() {
  return (
    <Router root={Layout}>
      <Route path="/" component={Home} />
      <Route path="/users/:id" component={User} />
    </Router>
  )
}
```

**新代码**：
```tsx
import {
  createRouter,
  RouterProvider,
  RouterView,
  RouterLink
} from '@zeus-js/router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/users/:id', component: User }
  ]
})

function App() {
  return (
    <RouterProvider router={router}>
      <Layout>
        <RouterLink to="/">Home</RouterLink>
        <RouterView />
      </Layout>
    </RouterProvider>
  )
}
```

---

*本文档基于 vue-router 设计理念编写*
*最后更新于 2026 年 4 月*
