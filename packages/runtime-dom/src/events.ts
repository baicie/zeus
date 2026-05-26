import { onScopeDispose } from '@zeus-js/signal'

export function bindEvent<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  name: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void
export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void
export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void {
  el.addEventListener(name, handler)

  onScopeDispose(() => {
    el.removeEventListener(name, handler)
  }, true)
}

const delegated = new Set<string>()

export function delegateEvents(events: readonly string[]): void {
  for (const event of events) {
    delegated.add(event)
  }
}
