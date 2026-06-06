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
    internals: meta.formAssociated ? attachElementInternals(host) : undefined,
    connected: false,
    loaded: false,
    values: new Map(),
    attributeProps: new Set(),
    reflectingAttrs: new Set(),
    pendingFormCallbacks: [],
    readyWaiters: [],
  }

  hostRefs.set(host, hostRef)

  return hostRef
}

function attachElementInternals(
  host: HTMLElement,
): ElementInternals | undefined {
  if (typeof host.attachInternals !== 'function') {
    return undefined
  }

  try {
    return host.attachInternals()
  } catch (error) {
    if (__DEV__) {
      console.warn('[zeus:web-c] Failed to attach ElementInternals.', error)
    }

    return undefined
  }
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
