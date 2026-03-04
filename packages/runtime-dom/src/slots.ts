// packages/runtime-dom/src/slots.ts

// Light DOM 插槽运行时支持
// 用于处理父组件传递的插槽内容

import { effect as _effect } from '@zeus-js/signal'

// 插槽内容存储
export interface SlotEntry {
  name: string
  content: any
}

// Signal 函数类型（与 alien-signals 返回值兼容）
type SlotSignal<T = any> = {
  (): T
  (value: T): void
}

// 当前活动的插槽上下文
let currentSlotContext: Map<string, SlotSignal<any> | any> | null = null

/**
 * 创建插槽上下文
 * 在组件渲染前调用，设置当前组件的插槽
 */
export function createSlotContext(): Map<string, SlotSignal<any> | any> {
  return new Map()
}

/**
 * 开始插槽上下文
 */
export function beginSlotScope(
  context: Map<string, SlotSignal<any> | any>,
): void {
  currentSlotContext = context
}

/**
 * 结束插槽上下文
 */
export function endSlotScope(): void {
  currentSlotContext = null
}

/**
 * 注册插槽内容
 * @param name 插槽名称
 * @param content 插槽内容
 */
export function setSlot(name: string, content: any): void {
  if (currentSlotContext) {
    currentSlotContext.set(name, content)
  }
}

/**
 * 渲染插槽
 * @param name 插槽名称
 * @param fallback 回退内容（当插槽不存在时）
 */
export function renderSlot(name: string, fallback?: any): any {
  if (currentSlotContext) {
    const slot = currentSlotContext.get(name)
    if (slot !== undefined) {
      const value = typeof slot === 'function' ? slot() : slot
      if (value != null) {
        return value
      }
    }
  }

  return fallback
}

/**
 * 插槽组件 - 用于在模板中渲染插槽
 * 编译器会生成对此函数的调用
 */
export function Slot(props: {
  name?: string
  fallback?: any
}): Node | Node[] | null {
  const name = props.name || 'default'
  const fallback = props.fallback

  return renderSlot(name, fallback)
}

/**
 * 动态插槽渲染
 * 用于响应式插槽内容
 */
export function DynamicSlot(props: {
  name?: string
  getter: () => any
}): Node | Node[] | null {
  let currentValue: any = null

  _effect(() => {
    const newValue = props.getter()
    currentValue = newValue
  })

  return currentValue
}
