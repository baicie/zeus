// ============================================================================
// @zeus-js/router - Hash History
// ============================================================================

import { extend } from '@zeus-js/shared'
import { createBaseHistory } from './base'
import type { History } from '../types'

// ============================================================================
// History Window
// ============================================================================

declare const window: Window & typeof globalThis

// ============================================================================
// Hash History 选项
// ============================================================================

export interface HashHistoryOptions {
  /** 基础路径 */
  base?: string
  /** Window 对象 */
  window?: Window
}

// ============================================================================
// 创建 Hash History
// ============================================================================

/**
 * 创建 Hash History
 *
 * 使用 URL hash (#) 进行路由
 */
export function createHashHistory(options: HashHistoryOptions = {}): History {
  const base = createBaseHistory({ base: options.base })
  const win = options.window || window

  // 获取 hash
  function getHash(): string {
    const href = win.location.href
    const index = href.indexOf('#')
    return index > -1 ? href.slice(index + 1) : ''
  }

  // 获取完整 URL
  function getUrl(hash: string): string {
    const href = win.location.href
    const index = href.indexOf('#')
    return index > -1 ? href.slice(0, index) + '#' + hash : href + '#' + hash
  }

  // 监听 hashchange
  function onHashChange() {
    const hash = getHash()
    if (hash !== base.location) {
      base.push(hash)
    }
  }

  // 监听器清理
  let cleanup: (() => void) | undefined

  return extend({}, base, {
    get location() {
      return getHash()
    },
    push(to: string) {
      const hash = to.startsWith('#') ? to.slice(1) : to
      win.location.hash = hash
      base.push(hash)
    },
    replace(to: string) {
      const hash = to.startsWith('#') ? to.slice(1) : to
      const url = getUrl(hash)
      win.history.replaceState(null, '', url)
      base.replace(hash)
    },
    init() {
      const hash = getHash()
      if (hash && hash !== '/') {
        base.push(hash)
      }
      win.addEventListener('hashchange', onHashChange)
      cleanup = () => {
        win.removeEventListener('hashchange', onHashChange)
      }
    },
    destroy() {
      if (cleanup) {
        cleanup()
      }
    },
  })
}
