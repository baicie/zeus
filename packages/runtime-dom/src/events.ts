// packages/runtime-dom/src/events.ts

import { onScopeDispose } from '@zeus-js/signal'

import { emitDevtoolsEvent } from './devtools'

type ZeusEventMap = Record<string, EventListener>

type ZeusElementWithEvents = Element & {
  __zeusEvents?: ZeusEventMap
}

type DelegatedListenerEntry = {
  name: string
  delegatedName: string
}

const delegatedEvents = new Set<string>()
const delegatedListeners: DelegatedListenerEntry[] = []

const nonBubblingEventMap: Record<string, string> = {
  focus: 'focusin',
  blur: 'focusout',
}

export function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
): void {
  const target = el as ZeusElementWithEvents
  const events = (target.__zeusEvents ||= {})

  events[name] = handler

  onScopeDispose(() => {
    if (target.__zeusEvents?.[name] === handler) {
      delete target.__zeusEvents[name]
    }
  }, true)
}

export function delegateEvents(events: readonly string[]): void {
  for (const event of events) {
    const delegatedName = normalizeDelegatedEventName(event)

    if (delegatedEvents.has(delegatedName)) continue

    delegatedEvents.add(delegatedName)

    const handler = dispatchDelegatedEvent
    delegatedListeners.push({ name: event, delegatedName })
    document.addEventListener(delegatedName, handler)
    emitDevtoolsEvent({ type: 'delegate-event', event: delegatedName })
  }
}

export function resetDelegatedEvents(): void {
  for (const entry of delegatedListeners) {
    document.removeEventListener(entry.delegatedName, dispatchDelegatedEvent)
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

function dispatchDelegatedEvent(event: Event): void {
  const eventName = normalizeOriginalEventName(event.type)

  let node = event.target as Node | null

  while (node && node !== document) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as ZeusElementWithEvents
      const handler = el.__zeusEvents?.[eventName]

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
