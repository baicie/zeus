// ============================================================================
// @zeus-js/router - 类型定义
// ============================================================================

import type { Component } from '@zeus-js/core'

// ============================================================================
// 路由记录
// ============================================================================

/** 路由记录类型 */
export type RouteRecordRaw = RouteRecordSingle | RouteRecordMultiple

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

/** Route Location Raw */
export type RouteLocationRaw = string | RouteLocationNormalized

// ============================================================================
// History
// ============================================================================

/** History 状态 */
export interface HistoryState {
  [key: string]: unknown
}

/** Navigation 回调 */
export type NavigationCallback = (event: NavigationEvent) => void

/** Navigation 事件 */
export interface NavigationEvent {
  type: 'push' | 'replace' | 'pop'
  from: string
  to: string
  index: number
}

/** History 选项 */
export interface HistoryOptions {
  /** 基础路径 */
  base?: string
}

/** History */
export interface History {
  /** 当前路径 */
  readonly location: string
  /** 基础路径 */
  readonly base: string
  /** 解析路径 */
  resolvePath(to: string): string
  /** 导航 */
  push(to: string): void
  /** 替换 */
  replace(to: string): void
  /** 前进/后退 */
  go(delta: number): void
  /** 后退 */
  back(): void
  /** 前进 */
  forward(): void
  /** 监听变化 */
  listen(callback: NavigationCallback): () => void
  /** 初始化 */
  init?(): void
  /** 销毁 */
  destroy?(): void
}

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
}

/** 规范化的路由记录（内部使用） */
export interface RouteRecord {
  path: string
  name?: string
  components: Record<string, unknown>
  alias: string[]
  matchAs?: string
  meta?: Record<string, unknown>
  children?: RouteRecord[]
  parent?: RouteRecord
}

/** Router 实例 */
export interface Router {
  /** 当前路由 */
  readonly currentRoute: () => RouteLocationNormalized
  /** History 实例 */
  readonly history: History
  /** 路由配置 */
  readonly routes: RouteRecordRaw[]

  /** 导航到指定路径 */
  push(to: RouteLocationRaw): void
  /** 替换当前路径 */
  replace(to: RouteLocationRaw): void
  /** 历史记录前进/后退 */
  go(delta: number): void
  /** 后退 */
  back(): void
  /** 前进 */
  forward(): void
  /** 添加路由 */
  addRoute(parentName: string, route: RouteRecordRaw): void
  /** 获取所有路由 */
  getRoutes(): RouteRecord[]
  /** 根据 name 获取路由 */
  getRoute(name: string): RouteRecord | undefined
  /** 解析路径 */
  resolve(to: RouteLocationRaw): RouteLocationNormalized
  /** 安装 */
  install?(app: unknown): void
  /** 初始化 */
  init?(): void
  /** 销毁 */
  destroy?(): void
}

// ============================================================================
// 兼容性别名
// ============================================================================

/** 兼容性别名 - RouteConfig */
export type RouteConfig = RouteRecordRaw

/** 兼容性别名 - Route */
export type Route = RouteLocationNormalized
