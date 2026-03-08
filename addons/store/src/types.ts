// addons/store/src/types.ts

// ============================================
// Store 类型定义
// ============================================

/**
 * Store 实例
 */
export interface Store<S = any> {
  /** Store 名称 */
  $name: string
  /** 响应式状态 */
  $state: S
  /** 获取原始状态 */
  $raw: () => S
  /** Actions */
  $actions?: Record<string, Function>
  /** 重置状态 */
  $reset: () => void
  /** 补丁状态 */
  $patch: (partial: Partial<S> | ((state: S) => Partial<S>)) => void
  /** 替换状态 */
  $replace: (newState: S) => void
  /** 订阅状态变化 */
  $subscribe: (callback: (state: S) => void) => () => void
  /** 销毁 Store */
  $dispose: () => void
}

/**
 * Store 选项
 */
export interface StoreOptions<S = any> {
  /** Store 名称 */
  name?: string
  /** 初始状态 */
  state?: () => S
  /** Getters */
  getters?: Record<string, (state: S) => any>
  /** Actions */
  actions?: Record<string, (...args: any[]) => any>
}

/**
 * 创建 Pinia 选项
 */
export interface CreatePiniaOptions {
  /** 是否启用调试 */
  debug?: boolean
}

/**
 * Pinia 实例
 */
export interface Pinia {
  /** 安装到应用 */
  install: (app: any) => void
  /** 使用 Store */
  use: <S>(storeOptions: StoreOptions<S>) => Store<S>
}
