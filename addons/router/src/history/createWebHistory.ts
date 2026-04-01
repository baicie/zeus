// ============================================================================
// @zeus-js/router - Browser History
// ============================================================================

import { extend } from '@zeus-js/shared'
import { createBaseHistory } from './base'
import type { History } from '../types'

// ============================================================================
// History Window
// ============================================================================

declare const window: Window & typeof globalThis

// ============================================================================
// Browser History 选项
// ============================================================================

export interface BrowserHistoryOptions {
  /** 基础路径 */
  base?: string
  /** Window 对象 */
  window?: Window
}

// ============================================================================
// 创建 Browser History
// ============================================================================

/**
 * 创建 Browser History
 *
 * 使用 HTML5 History API
 */
export function createWebHistory(options: BrowserHistoryOptions = {}): History {
  const base = createBaseHistory({ base: options.base })
  const win = options.window || window

  // 监听 popstate
  function onPopState() {
    const url = win.location.pathname + win.location.search + win.location.hash
    if (url !== base.location) {
      base.push(url)
    }
  }

  // 监听器清理
  let cleanup: (() => void) | undefined

  return extend({}, base, {
    get location() {
      return win.location.pathname + win.location.search + win.location.hash
    },
    push(to: string) {
      win.history.pushState(null, '', to)
      base.push(to)
    },
    replace(to: string) {
      win.history.replaceState(null, '', to)
      base.replace(to)
    },
    init() {
      const url =
        win.location.pathname + win.location.search + win.location.hash
      if (url !== '/') {
        base.push(url)
      }
      win.addEventListener('popstate', onPopState)
      cleanup = () => {
        win.removeEventListener('popstate', onPopState)
      }
    },
    destroy() {
      if (cleanup) {
        cleanup()
      }
    },
  })
}
