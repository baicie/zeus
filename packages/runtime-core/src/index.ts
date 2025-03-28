// 核心 API
export { createApp } from './apiCreateApp'
export { h, Fragment, Text } from './vnode'
export { getCurrentInstance, registerRuntimeCompiler } from './component'
export { nextTick } from './scheduler'
export { provide, inject } from './apiInject'
export { createRenderer } from './renderer'

// 组件相关
export { defineComponent } from './apiDefineComponent'
export { defineAsyncComponent } from './apiAsyncComponent'

// 生命周期钩子
export {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onBeforeUnmount,
  onUnmounted,
  onErrorCaptured,
} from './apiLifecycle'

// 内置组件
export { Suspense } from './components/Suspense'
export { Teleport } from './components/Teleport'
export { KeepAlive } from './components/KeepAlive'

// 工具函数
export { toDisplayString, camelize, capitalize } from '@zeusjs/shared'

// 类型导出
export type {
  App,
  Component,
  ComponentOptions,
  ComponentPublicInstance,
  ComputedOptions,
  MethodOptions,
  RenderFunction,
} from './component'
export type { VNode, VNodeChild, VNodeProps } from './vnode'
export type { Slot, Slots } from './componentSlots'
export type { Ref, ComputedRef, WritableComputedRef } from '@zeusjs/reactivity'

// 内部类型，供插件和工具使用
export type * from './componentOptions'
export type * from './directives'
