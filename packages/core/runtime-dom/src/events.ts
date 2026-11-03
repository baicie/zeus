// packages/runtime-dom/src/events.ts

import {
  getCurrentScope,
  onScopeDispose,
  trackRuntimeResource,
} from '@zeus-js/signal/internal'

import { emitDevtoolsEvent } from './devtools'
import { getScopeErrorBoundaryHandler } from './errorBoundaryContext'

type ZeusEventMap = Record<string, EventListener>

type ZeusElementWithEvents = Element & {
  __zeusEvents?: ZeusEventMap
  __zeusDirectEvents?: ZeusEventMap
}

const delegatedEvents = new Set<string>()
const delegatedListeners: string[] = []

// A native listener reports its removal to the diagnostics session that was
// active when it was attached, even if it is replaced or released elsewhere.
const directListenerDiagnostics = new WeakMap<
  Element,
  Map<string, () => void>
>()

const eventScopes = new WeakMap<Element, Map<string, object | undefined>>()

function releaseDirectListenerDiagnostics(el: Element, name: string): void {
  const releases = directListenerDiagnostics.get(el)
  const release = releases?.get(name)
  if (!release) return
  releases!.delete(name)
  release()
}

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
    releaseDirectListenerDiagnostics(el, name)
  }

  events[name] = handler
  let scopes = eventScopes.get(el)
  if (!scopes) eventScopes.set(el, (scopes = new Map()))
  scopes.set(name, getCurrentScope())

  if (!delegated || isInClosedShadowRoot(el)) {
    const directHandler: EventListener = event => {
      try {
        handler.call(el, event)
      } catch (error) {
        routeEventError(el, name, error)
      }
    }
    directEvents[name] = directHandler
    el.addEventListener(name, directHandler)
    const release = trackRuntimeResource('listeners')
    if (release) {
      let releases = directListenerDiagnostics.get(el)
      if (!releases) directListenerDiagnostics.set(el, (releases = new Map()))
      releases.set(name, release)
    }
  }

  onScopeDispose(() => {
    if (target.__zeusEvents?.[name] === handler) {
      delete target.__zeusEvents[name]
      eventScopes.get(el)?.delete(name)

      if (target.__zeusDirectEvents?.[name]) {
        el.removeEventListener(name, target.__zeusDirectEvents[name])
        delete target.__zeusDirectEvents[name]
        releaseDirectListenerDiagnostics(el, name)
      }
    }
  }, true)
}

/**
 * Registers one shared document listener per event type. These listeners are
 * process-wide and outlive any component, so runtime diagnostics sessions do
 * not count them; only per-element native listeners are counted.
 */
export function delegateEvents(events: readonly string[]): void {
  for (const event of events) {
    const delegatedName = normalizeDelegatedEventName(event)

    if (delegatedEvents.has(delegatedName)) continue

    delegatedEvents.add(delegatedName)

    const handler = dispatchDelegatedEvent
    delegatedListeners.push(delegatedName)
    document.addEventListener(delegatedName, handler)
    emitDevtoolsEvent({ type: 'delegate-event', event: delegatedName })
  }
}

export function resetDelegatedEvents(): void {
  for (const delegatedName of delegatedListeners) {
    document.removeEventListener(delegatedName, dispatchDelegatedEvent)
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
  if (!handler || el.__zeusDirectEvents?.[eventName]) return
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
          callDelegatedHandler(el, eventName, handler, event)

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
        callDelegatedHandler(el, eventName, handler, event)

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
  eventName: string,
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
    try {
      handler.call(el, event)
    } catch (error) {
      routeEventError(el, eventName, error)
    }
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

function routeEventError(el: Element, eventName: string, error: unknown): void {
  const scope = eventScopes.get(el)?.get(eventName)
  const handler = getScopeErrorBoundaryHandler(scope)
  if (!handler) throw error
  handler(error, 'event')
}
