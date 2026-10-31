// packages/runtime-dom/src/events.ts

import {
  incrementRuntimeDiagnostics,
  onScopeDispose,
} from '@zeus-js/signal/internal'

import { emitDevtoolsEvent } from './devtools'

type ZeusEventMap = Record<string, EventListener>

type ZeusElementWithEvents = Element & {
  __zeusEvents?: ZeusEventMap
  __zeusDirectEvents?: ZeusEventMap
}

const delegatedEvents = new Set<string>()
const delegatedListeners: string[] = []

const nonBubblingEventMap: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
}

/**
 * Binds `handler` for `name` on `el`. Delegated handlers are dispatched by the
 * document listener registered through `delegateEvents`; pass
 * `delegated = false` for events that do not bubble or for modules compiled
 * without delegation, which attach a native listener on the element instead.
 */
export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
  delegated = true,
): void {
  const target = el as ZeusElementWithEvents
  const events = (target.__zeusEvents ||= {})
  const directEvents = (target.__zeusDirectEvents ||= {})

  const previousDirectHandler = directEvents[name]
  if (previousDirectHandler) {
    el.removeEventListener(name, previousDirectHandler)
    delete directEvents[name]
    incrementRuntimeDiagnostics('listenersDisposed')
  }

  events[name] = handler

  if (!delegated || isInClosedShadowRoot(el)) {
    directEvents[name] = handler
    el.addEventListener(name, handler)
    incrementRuntimeDiagnostics('listenersCreated')
  }

  onScopeDispose(() => {
    if (target.__zeusEvents?.[name] === handler) {
      delete target.__zeusEvents[name]

      if (target.__zeusDirectEvents?.[name] === handler) {
        el.removeEventListener(name, handler)
        delete target.__zeusDirectEvents[name]
        incrementRuntimeDiagnostics('listenersDisposed')
      }
    }
  }, true)
}

export function delegateEvents(events: readonly string[]): void {
  for (const event of events) {
    const delegatedName = normalizeDelegatedEventName(event)

    if (delegatedEvents.has(delegatedName)) continue

    delegatedEvents.add(delegatedName)

    const handler = dispatchDelegatedEvent
    delegatedListeners.push(delegatedName)
    document.addEventListener(delegatedName, handler)
    incrementRuntimeDiagnostics('listenersCreated')
    emitDevtoolsEvent({ type: 'delegate-event', event: delegatedName })
  }
}

export function resetDelegatedEvents(): void {
  for (const delegatedName of delegatedListeners) {
    document.removeEventListener(delegatedName, dispatchDelegatedEvent)
    incrementRuntimeDiagnostics('listenersDisposed')
  }
  delegatedEvents.clear()
  delegatedListeners.length = 0
}

function normalizeDelegatedEventName(name: string): string {
  return nonBubblingEventMap[name] ?? name
}

function normalizeOriginalEventName(name: string): string {
  if (name === 'focusin') return 'focus'
  if (name === 'focusout') return 'blur'
  return name
}

function isInClosedShadowRoot(el: Element): boolean {
  const root = el.getRootNode() as DocumentFragment & { mode?: string }
  return root.nodeType === 11 && root.mode === 'closed'
}

// A handler attached natively has already run during the event's own
// propagation; the document delegate must not invoke it a second time when
// another module delegates the same event name.
function getDelegatedHandler(
  el: ZeusElementWithEvents,
  eventName: string,
): EventListener | undefined {
  const handler = el.__zeusEvents?.[eventName]
  if (!handler || el.__zeusDirectEvents?.[eventName] === handler) return
  return handler
}

function dispatchDelegatedEvent(event: Event): void {
  const eventName = normalizeOriginalEventName(event.type)

  const composedPath = event.composedPath?.()
  if (composedPath?.length) {
    for (const target of composedPath) {
      if (target === document || target === document.defaultView) break
      if (target && (target as Node).nodeType === Node.ELEMENT_NODE) {
        const el = target as ZeusElementWithEvents
        const handler = getDelegatedHandler(el, eventName)

        if (handler) {
          callDelegatedHandler(el, handler, event)

          if (event.cancelBubble) return
        }
      }
    }
    return
  }

  let node = event.target as Node | null

  while (node && node !== document) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as ZeusElementWithEvents
      const handler = getDelegatedHandler(el, eventName)

      if (handler) {
        callDelegatedHandler(el, handler, event)

        if (event.cancelBubble) {
          return
        }
      }
    }

    node = node.parentNode
  }
}

function callDelegatedHandler(
  el: Element,
  handler: EventListener,
  event: Event,
): void {
  const hadOwnCurrentTarget = Object.prototype.hasOwnProperty.call(
    event,
    'currentTarget',
  )

  const previousCurrentTarget = hadOwnCurrentTarget
    ? Object.getOwnPropertyDescriptor(event, 'currentTarget')
    : undefined

  try {
    Object.defineProperty(event, 'currentTarget', {
      configurable: true,
      get() {
        return el
      },
    })
  } catch {
    // Some environments may not allow redefining currentTarget.
    // handler.call(el, event) still gives function handlers `this === el`.
  }

  try {
    handler.call(el, event)
  } finally {
    try {
      if (previousCurrentTarget) {
        Object.defineProperty(event, 'currentTarget', previousCurrentTarget)
      } else {
        delete (event as unknown as { currentTarget?: EventTarget })
          .currentTarget
      }
    } catch {
      // ignore restore failure in non-browser test environments
    }
  }
}
