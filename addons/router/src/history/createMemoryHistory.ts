// ============================================================================
// @zeus-js/router - Memory History
// ============================================================================

import { extend } from '@zeus-js/shared'
import { createBaseHistory } from './base'
import type { History } from '../types'

// ============================================================================
// Memory History 选项
// ============================================================================

export interface MemoryHistoryOptions {
  /** 基础路径 */
  base?: string
  /** 初始路径 */
  initialEntries?: string[]
}

// ============================================================================
// 创建 Memory History
// ============================================================================

/**
 * 创建 Memory History
 *
 * 使用内存存储历史记录，适用于测试或非浏览器环境
 */
export function createMemoryHistory(
  options: MemoryHistoryOptions = {},
): History {
  const base = createBaseHistory({ base: options.base })

  // 初始化历史记录
  const routes: string[] = options.initialEntries || ['/']

  return extend({}, base, {
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
    },
  })
}
