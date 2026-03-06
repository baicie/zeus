// packages/runtime-core/src/slots/index.ts

// Light DOM 插槽实现
// 用于在 Light DOM 模式下渲染父组件传递的插槽内容

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
