// packages/runtime-core/src/slots/index.ts

// Light DOM 插槽实现
// 用于在 Light DOM 模式下渲染父组件传递的插槽内容

import { signal } from '@zeus-js/signal'

// 插槽内容类型
export type SlotContent = Node | (() => Node) | null | undefined

// 插槽 Props
export interface SlotProps {
  // 插槽名称，undefined 表示默认插槽
  name?: string
  // 插槽内容
  children?: SlotContent
  // 回退内容（当没有插槽内容时显示）
  fallback?: SlotContent
}

// Signal 函数类型（与 alien-signals 返回值兼容）
type SlotSignal = {
  (): SlotContent
  (value: SlotContent): void
}

// 作用域插槽注册
const slotScopeStack: Map<string, SlotSignal>[] = []

/**
 * 开始插槽作用域
 * 在组件渲染前调用，注册该组件的插槽
 */
export function beginSlotScope(slots: Map<string, SlotSignal>): void {
  slotScopeStack.push(slots)
}

/**
 * 结束插槽作用域
 * 在组件渲染后调用，清理插槽注册
 */
export function endSlotScope(): void {
  slotScopeStack.pop()
}

/**
 * 注册插槽内容
 * @param name 插槽名称，undefined 表示默认插槽
 * @param content 插槽内容
 */
export function setSlot(name: string | undefined, content: SlotContent): void {
  const slotName = name || 'default'
  const currentScope = slotScopeStack[slotScopeStack.length - 1]
  if (currentScope) {
    currentScope.set(slotName, signal(content))
  }
}

/**
 * 渲染插槽
 * @param name 插槽名称，undefined 表示默认插槽
 * @param fallback 回退内容
 */
export function renderSlot(
  name: string | undefined,
  fallback?: SlotContent,
): Node | null {
  const slotName = name || 'default'
  const currentScope = slotScopeStack[slotScopeStack.length - 1]

  if (currentScope) {
    const slotSignal = currentScope.get(slotName)
    if (slotSignal) {
      const content = slotSignal()
      if (content) {
        if (typeof content === 'function') {
          return content()
        }
        return content
      }
    }
  }

  // 渲染回退内容
  if (fallback) {
    if (typeof fallback === 'function') {
      return fallback()
    }
    return fallback
  }

  return null
}

/**
 * Slot 组件
 * 用于在模板中渲染插槽内容
 */
export function Slot(props: SlotProps): Node | null {
  const { name, fallback } = props
  return renderSlot(name, fallback) as Node | null
}

/**
 * 创建插槽组件包装器
 * 用于在父组件中将插槽内容传递给子组件
 */
export function createSlot(
  name: string | undefined,
  content: SlotContent,
): () => Node | null {
  return () => renderSlot(name, content)
}

/**
 * 将 children 转换为插槽内容
 */
export function normalizeChildren(
  children?: SlotContent | SlotContent[],
): SlotContent[] {
  if (!children) return []
  if (Array.isArray(children)) return children
  return [children]
}

/**
 * 检查值是否为有效的插槽内容
 */
export function isValidSlotContent(content: any): boolean {
  if (content === null || content === undefined) return false
  if (typeof content === 'function') return true
  if (content instanceof Node) return true
  return false
}
