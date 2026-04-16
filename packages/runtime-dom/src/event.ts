import { onCleanup } from '@zeusjs/core'

export type EventHandler = EventListenerOrEventListenerObject

export function bindEvent(
  el: Element,
  name: string,
  handler: EventHandler,
): () => void {
  el.addEventListener(name, handler)
  onCleanup(() => el.removeEventListener(name, handler))
}

export function bindEventDelegate(
  parent: Element,
  selector: string,
  name: string,
  handler: EventHandler,
): () => void {
  const delegateHandler = (e: Event) => {
    const target = (e.target as Element).closest(selector)
    if (target && parent.contains(target)) {
      if (typeof handler === 'function') {
        handler.call(target, e)
      } else {
        handler.handleEvent(e)
      }
    }
  }
  parent.addEventListener(name, delegateHandler)
  onCleanup(() => parent.removeEventListener(name, delegateHandler))
}
