// packages/runtime-dom/src/events/index.ts

export function addEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: boolean | AddEventListenerOptions,
): void {
  el.addEventListener(event, handler, options)
}

export function removeEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: boolean | EventListenerOptions,
): void {
  el.removeEventListener(event, handler, options)
}

export function createEventDelegation(
  container: Element,
  selector: string,
  event: string,
  handler: EventListener,
): () => void {
  const delegatedHandler = (e: Event) => {
    const target = e.target as Element
    if (target && target.matches(selector)) {
      handler(e)
    }
  }

  container.addEventListener(event, delegatedHandler)

  return () => {
    container.removeEventListener(event, delegatedHandler)
  }
}
