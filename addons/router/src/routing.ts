// ============================================================================
// @zeus-js/router - 路由匹配
// ============================================================================

import { extend } from '@zeus-js/shared'
import type { Params, RouteRecordRaw, RouteRecordSingle } from './types'

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
}

/**
 * 规范化路由记录
 */
export function normalizeRouteRecord(
  record: RouteRecordRaw,
): NormalizedRouteRecord {
  const single = record as RouteRecordSingle
  return {
    path: record.path,
    regex: pathToRegexp(record.path),
    keys: extractKeys(record.path),
    components: {
      default: (record as any).component,
    },
    alias: single.alias
      ? Array.isArray(single.alias)
        ? single.alias
        : [single.alias]
      : [],
    matchAs: (record as any).matchAs,
    name: single.name,
    meta: single.meta,
  }
}

/**
 * 路径转正则
 */
function pathToRegexp(path: string): RegExp {
  const keys: string[] = []
  const regexStr = path
    .replace(/\/\*/g, match => {
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
export function createRouteMatcher(routes: RouteRecordRaw[]): {
  matchRoute: (path: string) => RouteMatch | null
  resolvePath: (to: string, from?: string) => string
  routes: NormalizedRouteRecord[]
} {
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
  function matchRouteRecord(
    record: NormalizedRouteRecord,
    path: string,
  ): RouteMatch | null {
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
              params: extend({}, params, childMatch.params),
              matched: [record, ...childMatch.matched],
            }
          }
        }
      }
    }

    return {
      path: match[0],
      params,
      matched: [record],
    }
  }

  /**
   * 提取剩余路径
   */
  function extractRemainingPath(
    path: string,
    basePath: string,
  ): string | undefined {
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
    matchRoute: matchRoute,
    resolvePath: resolvePath,
    routes: normalizedRoutes,
  }
}

/**
 * 扁平化路由记录（处理嵌套）
 */
function flatRouteRecords(
  routes: RouteRecordRaw[],
  parent?: NormalizedRouteRecord,
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
function decode(value: string | undefined, _key: string): string {
  if (value === undefined) {
    return ''
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
