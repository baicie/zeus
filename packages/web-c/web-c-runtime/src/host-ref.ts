// packages/web-c-runtime/src/host-ref.ts

import type { HostRef, ZeusLazyComponentMeta } from './types'

const hostRefs = new WeakMap<HTMLElement, HostRef>()

export function registerHost(
  host: HTMLElement,
  meta: ZeusLazyComponentMeta,
): HostRef {
  const existing = hostRefs.get(host)

  if (existing) {
    return existing
  }

  const hostRef: HostRef = {
    host,
    meta,
    connected: false,
    loaded: false,
    values: new Map(),
    reflectingAttrs: new Set(),
    readyWaiters: [],
  }

  hostRefs.set(host, hostRef)

  return hostRef
}

export function getHostRef(host: HTMLElement): HostRef | undefined {
  return hostRefs.get(host)
}

export function requireHostRef(host: HTMLElement): HostRef {
  const hostRef = getHostRef(host)

  if (!hostRef) {
    throw new Error(
      `[zeus:web-c] hostRef not found for <${host.tagName.toLowerCase()}>.`,
    )
  }

  return hostRef
}
