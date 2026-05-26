// packages/runtime-dom/src/events.ts

import { onScopeDispose } from '@zeus-js/signal'

import { emitDevtoolsEvent } from './devtools'

type ZeusEventMap = Record<string, EventListener>

type ZeusElementWithEvents = Element & {
  __zeusEvents?: ZeusEventMap
}

const delegatedEvents = new Set<string>()

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
  for (const eventName of events) {
    if (delegatedEvents.has(eventName)) continue

    delegatedEvents.add(eventName)
    document.addEventListener(eventName, dispatchDelegatedEvent)
    emitDevtoolsEvent({ type: 'delegate-event', event: eventName })
  }
}

function dispatchDelegatedEvent(event: Event): void {
  let node = event.target as Node | null

  while (node && node !== document) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as ZeusElementWithEvents
      const handler = el.__zeusEvents?.[event.type]

      if (handler) {
        handler.call(el, createDelegatedEvent(event, el))

        if (event.cancelBubble) {
          return
        }
      }
    }

    node = node.parentNode
  }
}

function createDelegatedEvent(event: Event, currentTarget: Element): Event {
  return new Proxy(event, {
    get(target, key, receiver) {
      if (key === 'currentTarget') {
        return currentTarget
      }

      const value = Reflect.get(target, key, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },

    set(target, key, value, receiver) {
      return Reflect.set(target, key, value, receiver)
    },
  })
}
