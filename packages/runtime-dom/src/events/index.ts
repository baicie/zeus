// packages/runtime-dom/src/events/index.ts

// 纯函数式事件处理

export type EventTargetLike = Element | Window | Document
export type EventHandler = (event: Event) => void

// 基本事件监听
export function addEventListener(
  el: EventTargetLike,
  event: string,
  handler: EventHandler,
  options?: boolean | AddEventListenerOptions,
): () => void {
  el.addEventListener(event, handler, options)
  return () => el.removeEventListener(event, handler, options)
}

export function removeEventListener(
  el: EventTargetLike,
  event: string,
  handler: EventHandler,
  options?: boolean | EventListenerOptions,
): void {
  el.removeEventListener(event, handler, options)
}

// 一次性事件监听
export function once(
  el: EventTargetLike,
  event: string,
  handler: EventHandler,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const opts =
    typeof options === 'boolean' ? { capture: options } : options || {}
  const onceHandler = (e: Event) => {
    handler(e)
    el.removeEventListener(event, onceHandler, opts)
  }

  el.addEventListener(event, onceHandler, opts)
  return () => el.removeEventListener(event, onceHandler, opts)
}

// 事件委托
export function delegate(
  container: EventTargetLike,
  selector: string,
  event: string,
  handler: EventHandler,
): () => void {
  const delegatedHandler = (e: Event) => {
    const target = e.target as Element
    if (target && target.matches && target.matches(selector)) {
      handler(e)
    }
  }

  container.addEventListener(event, delegatedHandler)
  return () => container.removeEventListener(event, delegatedHandler)
}

// 批量事件监听
export function addEventListeners(
  el: EventTargetLike,
  events: Record<string, EventHandler>,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const cleanups: (() => void)[] = []

  for (const [event, handler] of Object.entries(events)) {
    const cleanup = addEventListener(el, event, handler, options)
    cleanups.push(cleanup)
  }

  return () => cleanups.forEach(cleanup => cleanup())
}

// 防抖事件处理
export function debounceEvent<T extends Event>(
  handler: (event: T) => void,
  delay: number,
): (event: T) => void {
  let timeoutId: number | null = null

  return (event: T) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }

    timeoutId = window.setTimeout(() => {
      handler(event)
      timeoutId = null
    }, delay)
  }
}

// 节流事件处理
export function throttleEvent<T extends Event>(
  handler: (event: T) => void,
  delay: number,
): (event: T) => void {
  let lastCall = 0

  return (event: T) => {
    const now = Date.now()
    if (now - lastCall >= delay) {
      handler(event)
      lastCall = now
    }
  }
}

// 停止事件传播
export function stopPropagation(event: Event): void {
  event.stopPropagation()
}

// 阻止默认行为
export function preventDefault(event: Event): void {
  event.preventDefault()
}

// 停止事件传播并阻止默认行为
export function stop(event: Event): void {
  event.stopPropagation()
  event.preventDefault()
}

// 创建自定义事件
export function createEvent(
  type: string,
  options?: CustomEventInit,
): CustomEvent {
  return new CustomEvent(type, options)
}

// 触发自定义事件
export function dispatchEvent(
  el: EventTargetLike,
  event: Event | string,
  options?: CustomEventInit,
): boolean {
  const evt = typeof event === 'string' ? createEvent(event, options) : event
  return el.dispatchEvent(evt)
}
