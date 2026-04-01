// ============================================================================
// @zeus-js/router - History 基类
// ============================================================================

import { signal } from '@zeus-js/core'

import type {
  History,
  HistoryOptions,
  NavigationCallback,
  NavigationEvent,
} from '../types'

// ============================================================================
// 创建 History 基类
// ============================================================================

/**
 * 创建 History 基类
 *
 * 提供基础的导航和监听功能
 */
export function createBaseHistory(options: HistoryOptions = {}): History {
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
      index: index(),
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
    get location() {
      return current()
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
          index: newIndex,
        })
      }
    },
    back() {
      this.go(-1)
    },
    forward() {
      this.go(1)
    },
    listen,
  }
}
