// 全局委托事件映射
const delegatedEvents = new Map<string, Set<HTMLElement>>()

// 委托事件处理
export function delegateEvents(events: string[]): void {
  for (const eventName of events) {
    if (!delegatedEvents.has(eventName)) {
      // 为事件创建新的处理器集合
      delegatedEvents.set(eventName, new Set())

      // 添加全局事件监听器
      document.addEventListener(eventName, handleDelegatedEvent)
    }
  }
}

// 委托事件处理函数
function handleDelegatedEvent(event: Event): void {
  const { type, target } = event
  if (!target) return

  let node = target as HTMLElement
  const handlers = delegatedEvents.get(type)

  if (!handlers) return

  // 冒泡查找处理器
  while (node) {
    // 检查处理器属性
    const handler = node[`on${type}`]
    if (typeof handler === 'function' && handlers.has(node)) {
      handler.call(node, event)
      if (event.cancelBubble) break
    }

    // 向上冒泡
    if (node.parentNode) {
      node = node.parentNode as HTMLElement
    } else {
      break
    }
  }
}

// 添加代理事件处理器
export function addDelegatedEventHandler(
  el: HTMLElement,
  eventName: string,
  handler: EventListener
): void {
  // 获取事件集合
  let handlers = delegatedEvents.get(eventName)
  if (!handlers) {
    // 如果事件未委托，则直接添加
    el.addEventListener(eventName, handler)
    return
  }

  // 保存处理器为元素属性
  el[`on${eventName}`] = handler

  // 添加到委托集合
  handlers.add(el)
}

// 移除代理事件处理器
export function removeDelegatedEventHandler(
  el: HTMLElement,
  eventName: string
): void {
  // 获取事件集合
  const handlers = delegatedEvents.get(eventName)
  if (!handlers) return

  // 从委托集合中移除
  handlers.delete(el)

  // 删除处理器属性
  delete el[`on${eventName}`]
}
