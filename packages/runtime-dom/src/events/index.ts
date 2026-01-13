// packages/runtime-dom/src/events/index.ts

// 最简单的事件处理 / Simplest event handling

// 事件处理器类型 / Event handler type
export type EventHandler = (event: Event) => void

// 添加事件监听器 / Add event listener
export function addEventListener(
  el: Element | Window | Document,
  event: string,
  handler: EventHandler,
): () => void {
  // 绑定事件 / Bind event
  el.addEventListener(event, handler)
  // 返回清理函数 / Return cleanup function
  return () => el.removeEventListener(event, handler)
}

// 移除事件监听器 / Remove event listener
export function removeEventListener(
  el: Element | Window | Document,
  event: string,
  handler: EventHandler,
): void {
  // 解绑事件 / Unbind event
  el.removeEventListener(event, handler)
}
