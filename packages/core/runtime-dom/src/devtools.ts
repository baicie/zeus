// Runtime-only bridge for the optional DevTools integration.

/* eslint-disable no-unused-vars */

export type ZeusDevtoolsEventType =
  | 'render'
  | 'effect'
  | 'mount-for'
  | 'delegate-event'
  | 'owner:create'
  | 'owner:dispose'
  | 'component:create'
  | 'component:dispose'
  | 'effect:run'
  | 'binding:commit'
  | 'binding:cleanup'
  | 'dependency:track'
  | 'dependency:trigger'
  | 'dependency:untrack'

export interface ZeusDevtoolsEvent {
  readonly id: number
  readonly timestamp: number
  readonly type: ZeusDevtoolsEventType
  readonly target?: Node
  readonly targetId?: number
  readonly ownerId?: number
  readonly componentId?: number
  readonly componentName?: string
  readonly bindingId?: number
  readonly effectId?: number
  /** Opaque identity of the reactive dependency target. */
  readonly sourceId?: number
  readonly event?: string
  readonly length?: number
  readonly name?: string
  readonly payload?: Readonly<Record<string, unknown>>
}

type ZeusDevtoolsEventInput = Omit<ZeusDevtoolsEvent, 'id' | 'timestamp'>

export type ZeusDevtoolsHook = {
  emit: (event: ZeusDevtoolsEvent) => void
}

export interface ZeusDevtoolsEmitOptions {
  /** Diagnostic events must never make an application update fail. */
  readonly swallowErrors?: boolean
}

declare global {
  interface Window {
    __ZEUS_DEVTOOLS_HOOK__?: ZeusDevtoolsHook
  }
}

let nextEventId = 1
let nextObjectId = 1
const objectIds = new WeakMap<object, number>()

export function getDevtoolsObjectId(value: object): number {
  const existing = objectIds.get(value)
  if (existing !== undefined) return existing

  const id = nextObjectId++
  objectIds.set(value, id)
  return id
}

export function emitDevtoolsEvent(
  event: ZeusDevtoolsEventInput,
  options: ZeusDevtoolsEmitOptions = {},
): void {
  if (typeof window === 'undefined') return

  const hook = window.__ZEUS_DEVTOOLS_HOOK__
  if (!hook) return

  const targetId = event.target ? getDevtoolsObjectId(event.target) : undefined
  const enriched: ZeusDevtoolsEvent = {
    ...event,
    id: nextEventId++,
    timestamp:
      typeof performance !== 'undefined' ? performance.now() : Date.now(),
    ...(targetId === undefined ? {} : { targetId }),
  }

  if (options.swallowErrors) {
    try {
      hook.emit(enriched)
    } catch {
      // DevTools must remain an observer. A broken panel cannot break updates.
    }
    return
  }

  hook.emit(enriched)
}
