// packages/web-c-runtime/src/lifecycle.ts

import { invokeFormCallback } from './form-callbacks'
import { getHostRef } from './host-ref'
import { applyInitialValues } from './props'

import type { HostRef, ZeusComponentModule } from './types'

const moduleCache = new WeakMap<HostRef['meta'], Promise<ZeusComponentModule>>()
const ancestorWaitCancellations = new WeakMap<HostRef, () => void>()

export function cancelAncestorWait(hostRef: HostRef): void {
  ancestorWaitCancellations.get(hostRef)?.()
}

export function waitForComponentReady(hostRef: HostRef): Promise<HTMLElement> {
  if (hostRef.readinessError) {
    return Promise.reject(hostRef.readinessError)
  }

  if (hostRef.loaded && !hostRef.loading) {
    return Promise.resolve(hostRef.host)
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
  if (hostRef.loading) {
    await hostRef.loading
    if (hostRef.connected && !hostRef.loaded) await initializeComponent(hostRef)
    return
  }

  if (hostRef.loaded && !findPendingAncestor(hostRef.host)) {
    hostRef.instance?.connected?.()
    flushPendingFormCallbacks(hostRef)
    return
  }

  const loading = hostRef.loaded
    ? reconnectComponent(hostRef)
    : doInitializeComponent(hostRef)

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

  if (hostRef.connected && hostRef.loaded) resolveReadyWaiters(hostRef)
}

async function doInitializeComponent(hostRef: HostRef): Promise<void> {
  applyInitialValues(hostRef)

  const mod = await loadComponentModule(hostRef)

  await waitForAncestors(hostRef)

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
  } catch (error) {
    hostRef.instance = undefined
    hostRef.loaded = false

    instance.dispose?.()

    throw error
  }
}

async function reconnectComponent(hostRef: HostRef): Promise<void> {
  await waitForAncestors(hostRef)
  if (!hostRef.connected) return
  hostRef.instance?.connected?.()
  flushPendingFormCallbacks(hostRef)
}

async function waitForAncestors(hostRef: HostRef): Promise<void> {
  // Fetch chunks concurrently, but establish ancestor scopes and DOM context
  // before running a descendant's setup. Recheck after each wait in case the
  // host moved while a chunk was loading.
  let ancestor = findPendingAncestor(hostRef.host)
  while (hostRef.connected && ancestor) {
    try {
      await waitForAncestorReady(hostRef, ancestor)
    } catch (error) {
      // A disconnect can reject the old ancestor waiter before a subtree is
      // reconnected. Only propagate failures from the current ancestor scope.
      if (
        hostRef.connected &&
        ancestor.connected &&
        ancestor.readinessError === error &&
        findPendingAncestor(hostRef.host) === ancestor
      ) {
        throw error
      }
    }
    ancestor = findPendingAncestor(hostRef.host)
  }
}

function waitForAncestorReady(
  hostRef: HostRef,
  ancestor: HostRef,
): Promise<void> {
  if (ancestor.readinessError) return Promise.reject(ancestor.readinessError)
  if (ancestor.loaded && !ancestor.loading) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      const index = ancestor.readyWaiters.indexOf(waiter)
      if (index >= 0) ancestor.readyWaiters.splice(index, 1)
      if (ancestorWaitCancellations.get(hostRef) === cancel) {
        ancestorWaitCancellations.delete(hostRef)
      }
    }
    const cancel = () => {
      cleanup()
      resolve()
    }
    const waiter = {
      resolve() {
        cleanup()
        resolve()
      },
      reject(error: unknown) {
        cleanup()
        reject(error)
      },
    }
    ancestorWaitCancellations.set(hostRef, cancel)
    ancestor.readyWaiters.push(waiter)
  })
}

function findPendingAncestor(host: HTMLElement): HostRef | undefined {
  let node: Node | null = host.parentNode
  while (node) {
    if (node.nodeType === 1) {
      const ancestor = getHostRef(node as HTMLElement)
      if (
        ancestor?.connected &&
        (!ancestor.loaded || ancestor.loading || ancestor.readinessError)
      ) {
        return ancestor
      }
    }
    node =
      node.parentNode ??
      (node.nodeType === 11 ? (node as ShadowRoot).host : null)
  }
  return undefined
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
