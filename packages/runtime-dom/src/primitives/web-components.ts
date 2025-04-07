// packages/runtime-dom/src/primitives/web-components.ts
export function processSlotProjection(
  hostElement: HTMLElement,
  content: DocumentFragment,
  mode: 'shadow' | 'light' = 'light'
): void {
  if (mode === 'shadow') {
    // 使用Shadow DOM
    const shadowRoot = hostElement.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(content)
    return
  }

  // Light DOM slot 投影处理
  const slotPlaceholders = hostElement.querySelectorAll('[data-slot]')
  const namedSlots = new Map<string, HTMLElement>()

  // 收集所有具名槽位
  slotPlaceholders.forEach(placeholder => {
    const slotName = placeholder.getAttribute('data-slot') || 'default'
    namedSlots.set(slotName, placeholder as HTMLElement)
  })

  // 投影内容
  const childSlots = content.querySelectorAll('[slot]')
  childSlots.forEach(slotContent => {
    const slotName = slotContent.getAttribute('slot') || 'default'
    const target = namedSlots.get(slotName)

    if (target) {
      target.innerHTML = ''
      target.appendChild(slotContent)
    }
  })

  // 处理默认 slot
  const defaultSlot = namedSlots.get('default')
  if (defaultSlot) {
    // 获取所有没有指定 slot 的节点
    Array.from(content.childNodes).forEach(node => {
      if (!node.hasAttribute || !node.hasAttribute('slot')) {
        defaultSlot.appendChild(node.cloneNode(true))
      }
    })
  }
}
