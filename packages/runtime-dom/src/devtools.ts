// packages/runtime-dom/src/devtools.ts

/* eslint-disable no-unused-vars */
export type ZeusDevtoolsEvent =
  | {
      type: 'render'
      target: Element | DocumentFragment
    }
  | {
      type: 'effect'
      name?: string
    }
  | {
      type: 'mount-for'
      length: number
    }
  | {
      type: 'delegate-event'
      event: string
    }

export type ZeusDevtoolsHook = {
  emit: (event: ZeusDevtoolsEvent) => void
}

declare global {
  interface Window {
    __ZEUS_DEVTOOLS_HOOK__?: ZeusDevtoolsHook
  }
}

export function emitDevtoolsEvent(event: ZeusDevtoolsEvent): void {
  if (typeof window === 'undefined') return
  window.__ZEUS_DEVTOOLS_HOOK__?.emit(event)
}
