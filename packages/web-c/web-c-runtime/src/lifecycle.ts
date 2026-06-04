// packages/web-c-runtime/src/lifecycle.ts

import { applyInitialValues, replayQueuedAttributes } from './props'

import type { HostRef, ZeusComponentModule } from './types'

const moduleCache = new WeakMap<HostRef['meta'], Promise<ZeusComponentModule>>()

export async function initializeComponent(hostRef: HostRef): Promise<void> {
  if (hostRef.loaded) {
    hostRef.instance?.connected?.()
    return
  }

  if (hostRef.loading) {
    await hostRef.loading
    return
  }

  hostRef.loading = doInitializeComponent(hostRef).finally(() => {
    if (!hostRef.loaded) {
      hostRef.loading = undefined
    }
  })

  await hostRef.loading
}

async function doInitializeComponent(hostRef: HostRef): Promise<void> {
  applyInitialValues(hostRef)

  const mod = await loadComponentModule(hostRef)

  if (!hostRef.connected) {
    return
  }

  const instance = mod.createComponent(hostRef)

  hostRef.instance = instance
  hostRef.loaded = true

  replayQueuedAttributes(hostRef)

  instance.connected?.()

  const rendered = instance.render?.()

  if (rendered !== undefined) {
    mountRenderedOutput(hostRef, rendered)
  }
}

async function loadComponentModule(
  hostRef: HostRef,
): Promise<ZeusComponentModule> {
  let pending = moduleCache.get(hostRef.meta)

  if (!pending) {
    pending = hostRef.meta.load().then(mod => {
      return 'default' in mod ? mod.default : mod
    })

    moduleCache.set(hostRef.meta, pending)
  }

  return pending
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
