// packages/web-c-runtime/src/lifecycle.ts

import { invokeFormCallback } from './form-callbacks'
import { applyInitialValues } from './props'

import type { HostRef, ZeusComponentModule } from './types'

const moduleCache = new WeakMap<HostRef['meta'], Promise<ZeusComponentModule>>()

export function waitForComponentReady(hostRef: HostRef): Promise<HTMLElement> {
  if (hostRef.loaded) {
    return Promise.resolve(hostRef.host)
  }

  if (hostRef.readinessError) {
    return Promise.reject(hostRef.readinessError)
  }

  return new Promise((resolve, reject) => {
    hostRef.readyWaiters.push({
      resolve,
      reject,
    })
  })
}

export function rejectComponentReady(hostRef: HostRef, error: Error): void {
  hostRef.readinessError = error
  for (const name of Object.keys(hostRef.exposedMethods)) {
    delete hostRef.exposedMethods[name]
  }
  rejectReadyWaiters(hostRef, error)
}

export async function initializeComponent(hostRef: HostRef): Promise<void> {
  if (hostRef.loaded) {
    hostRef.instance?.connected?.()
    flushPendingFormCallbacks(hostRef)
    return
  }

  if (hostRef.loading) {
    await hostRef.loading
    if (hostRef.connected && !hostRef.loaded) await initializeComponent(hostRef)
    return
  }

  const loading = doInitializeComponent(hostRef)

  hostRef.loading = loading

  try {
    await loading
  } catch (error) {
    rejectComponentReady(
      hostRef,
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  } finally {
    if (hostRef.loading === loading) {
      hostRef.loading = undefined
    }
  }
}

async function doInitializeComponent(hostRef: HostRef): Promise<void> {
  applyInitialValues(hostRef)

  const mod = await loadComponentModule(hostRef)

  if (!hostRef.connected) {
    return
  }

  const instance = mod.createComponent(hostRef)

  hostRef.instance = instance

  try {
    instance.connected?.()
    flushPendingFormCallbacks(hostRef)

    const rendered = instance.render?.()

    if (rendered !== undefined) {
      mountRenderedOutput(hostRef, rendered)
    }

    hostRef.loaded = true

    resolveReadyWaiters(hostRef)
  } catch (error) {
    hostRef.instance = undefined
    hostRef.loaded = false

    instance.dispose?.()

    throw error
  }
}

function flushPendingFormCallbacks(hostRef: HostRef): void {
  while (hostRef.pendingFormCallbacks.length > 0) {
    invokeFormCallback(hostRef, hostRef.pendingFormCallbacks[0])
    hostRef.pendingFormCallbacks.shift()
  }
}

async function loadComponentModule(
  hostRef: HostRef,
): Promise<ZeusComponentModule> {
  let pending = moduleCache.get(hostRef.meta)

  if (!pending) {
    pending = hostRef.meta
      .load()
      .then(mod => {
        return 'default' in mod ? mod.default : mod
      })
      .catch(error => {
        moduleCache.delete(hostRef.meta)
        throw error
      })

    moduleCache.set(hostRef.meta, pending)
  }

  return pending
}

function resolveReadyWaiters(hostRef: HostRef): void {
  const waiters = hostRef.readyWaiters.splice(0)

  for (const waiter of waiters) {
    waiter.resolve(hostRef.host)
  }
}

function rejectReadyWaiters(hostRef: HostRef, error: unknown): void {
  const waiters = hostRef.readyWaiters.splice(0)

  for (const waiter of waiters) {
    waiter.reject(error)
  }
}

function mountRenderedOutput(
  hostRef: HostRef,
  rendered: string | Node | Node[],
): void {
  const root = getRenderRoot(hostRef)

  if (typeof rendered === 'string') {
    root.innerHTML = rendered
    return
  }

  if (Array.isArray(rendered)) {
    root.replaceChildren(...rendered)
    return
  }

  root.replaceChildren(rendered)
}

function getRenderRoot(hostRef: HostRef): ShadowRoot | HTMLElement {
  if (!hostRef.meta.shadow) {
    return hostRef.host
  }

  return (
    hostRef.host.shadowRoot ??
    hostRef.host.attachShadow({
      mode: 'open',
    })
  )
}
