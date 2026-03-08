// addons/store/src/index.ts

// 组合式 API
export { createPinia, useStore } from './composables'

// 选项式 API
export { defineStore } from './options'

// 类型导出
export type { Store, StoreOptions, CreatePiniaOptions, Pinia } from './types'
