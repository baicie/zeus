import { createFilter } from 'vite'
import type { FilterPattern } from 'vite'

/**
 * 检查文件是否需要被处理
 */
export function isFileIncluded(
  id: string,
  include: FilterPattern,
  exclude: FilterPattern
): boolean {
  const filter = createFilter(include, exclude)
  return filter(id)
}

/**
 * 检查是否为自定义元素名称
 */
export function isCustomElementName(name: string, prefix?: string): boolean {
  // 自定义元素名称必须包含连字符
  if (!name.includes('-')) return false

  // 如果指定了前缀，检查是否匹配
  if (prefix && !name.startsWith(prefix)) return false

  return true
}

/**
 * 检查是否为开发环境
 */
export function isDev(config: any): boolean {
  return config.mode === 'development' || config.command === 'serve'
}

/**
 * 创建调试日志函数
 */
export function createLogger(enabled = false) {
  return (...args: any[]) => {
    if (enabled) {
      // eslint-disable-next-line no-console
      console.log('[vite-plugin-zeus]', ...args)
    }
  }
}

export const extend: typeof Object.assign = Object.assign
