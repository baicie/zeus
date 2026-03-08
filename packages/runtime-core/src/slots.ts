export type SlotContent = Node | (() => Node) | null | undefined

export interface SlotProps {
  name?: string
  children?: SlotContent
  fallback?: SlotContent
}

type SlotSignal = {
  (): SlotContent
  (value: SlotContent): void
}

const slotScopeStack: Map<string, SlotSignal>[] = []

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

export function Slot(props: SlotProps): Node | null {
  const { name, fallback } = props
  return renderSlot(name, fallback) as Node | null
}
