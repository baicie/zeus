import * as signal from '@zeus-js/signal'
import * as runtimeDom from '@zeus-js/runtime-dom'
import * as query from '@zeus-js/query'
import * as router from '@zeus-js/router'
import * as zeus from '@zeus-js/zeus'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createApp, defineComponent, h } from 'vue'
import {
  PLAYGROUND_SANDBOX_CHANNEL,
  PLAYGROUND_SANDBOX_MESSAGE_VERSION,
  isLoopbackSandboxHostname,
  isTrustedSandboxParentOrigin,
  parseSandboxMessage,
  parseSandboxParentOrigins,
  previewModulePlaceholder,
  sandboxSessionFromLocation,
} from '@zeus-js/playground-engine'

import type {
  PlaygroundSandboxMessage,
  PlaygroundPreviewPayload,
  PlaygroundSandboxDevtools,
} from '@zeus-js/playground-engine'

import sandboxStyles from './sandbox.css?inline'

// Capture the opaque-origin decision before any preview code can run.
// `Window.origin` is writable and `location.origin` remains the URL origin in
// a sandboxed document, so neither can be re-read as a trust signal later.
const opaqueOrigin = globalThis.origin === 'null'
if (!opaqueOrigin) {
  throw new Error(
    'Zeus playground sandbox requires an opaque origin. Serve sandbox.html with Content-Security-Policy: sandbox allow-scripts and embed it in an iframe with sandbox="allow-scripts".',
  )
}

declare global {
  var __ZEUS_PLAYGROUND_RUNTIME__: Record<string, object>
  interface Window {
    __ZEUS_DEVTOOLS_HOOK__?: {
      emit(event: {
        type: string
        timestamp?: number
        ownerId?: number
        componentId?: number
        bindingId?: number
        effectId?: number
        sourceId?: number
        targetId?: number
        name?: string
        payload?: Readonly<Record<string, unknown>>
      }): void
    }
  }
}

globalThis.__ZEUS_PLAYGROUND_RUNTIME__ = {
  '@zeus-js/playground-engine': {},
  '@zeus-js/query': query,
  '@zeus-js/router': router,
  '@zeus-js/runtime-dom': runtimeDom,
  '@zeus-js/signal': signal,
  '@zeus-js/zeus': zeus,
  '@zeus-js/zeus/jsx-dev-runtime': zeus,
  '@zeus-js/zeus/jsx-runtime': zeus,
}

const sessionId = sandboxSessionFromLocation(location)
const configuredParentOrigins = parseSandboxParentOrigins(
  import.meta.env.VITE_ZEUS_PLAYGROUND_HOST_ORIGINS,
)
const allowLoopbackParent = isLoopbackSandboxHostname(location.hostname)
if (!allowLoopbackParent && configuredParentOrigins.length === 0) {
  console.error(
    '[Zeus playground sandbox] VITE_ZEUS_PLAYGROUND_HOST_ORIGINS must list the trusted host origin; all parent messages are rejected.',
  )
}
const root = document.querySelector<HTMLElement>('#root')
if (!root) throw new Error('Playground sandbox root is missing.')
const baseStyle = document.createElement('style')
baseStyle.textContent = sandboxStyles
document.head.append(baseStyle)

let trustedParentOrigin: string | undefined
let generation = 0
let disposePreview: (() => void) | undefined
let activeUrls: string[] = []
let activeStyles: HTMLStyleElement[] = []
let devtools: SandboxDevtools | undefined
let disposeHostPreview: (() => void) | undefined

window.addEventListener('message', event => {
  if (event.source !== window.parent) return
  if (
    !isTrustedSandboxParentOrigin(event.origin, configuredParentOrigins, {
      allowLoopback: allowLoopbackParent,
    })
  ) {
    return
  }
  if (trustedParentOrigin && event.origin !== trustedParentOrigin) return
  const message = parseSandboxMessage(event.data)
  if (!message || message.sessionId !== sessionId) return
  trustedParentOrigin ??= event.origin
  if (message.kind === 'sandbox-load') {
    void run(message)
  } else if (message.kind === 'sandbox-stop') {
    stop()
  } else if (message.kind === 'sandbox-host-preview') {
    void runHostPreview(message)
  }
})

window.parent.postMessage(
  {
    channel: PLAYGROUND_SANDBOX_CHANNEL,
    version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
    kind: 'sandbox-ready',
    sessionId,
    capabilities: {
      opaqueOrigin,
      modules: true,
    },
  },
  '*',
)

async function run(
  message: Extract<PlaygroundSandboxMessage, { kind: 'sandbox-load' }>,
): Promise<void> {
  const current = ++generation
  const started = performance.now()

  try {
    stopLoadedPreview()
    revokeUrls()
    clearStyles()
    root!.replaceChildren()
    injectStyles(message.payload)
    devtools = createSandboxDevtools()
    const entry = await createProjectModules(message.payload)
    if (current !== generation) return
    const namespace: Record<string, unknown> = await import(entry)
    if (current !== generation) return
    mountFallbackComponent(namespace)
    window.parent.postMessage(
      {
        channel: PLAYGROUND_SANDBOX_CHANNEL,
        version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
        kind: 'sandbox-result',
        sessionId,
        requestId: message.requestId,
        status: 'ready',
        durationMs: performance.now() - started,
        exportedNames: Object.keys(namespace).sort(),
        devtools: devtools?.snapshot(),
      },
      trustedParentOrigin ?? '*',
    )
  } catch (error) {
    if (current !== generation) return
    console.error('[Zeus playground preview]', error)
    window.parent.postMessage(
      {
        channel: PLAYGROUND_SANDBOX_CHANNEL,
        version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
        kind: 'sandbox-error',
        sessionId,
        requestId: message.requestId,
        code: 'ZEUS_PLAYGROUND_PREVIEW_RUNTIME',
        message: errorMessage(error),
      },
      trustedParentOrigin ?? '*',
    )
  }
}

async function createProjectModules(
  payload: PlaygroundPreviewPayload,
): Promise<string> {
  const paths = new Map<string, string>()
  for (const [index, module] of payload.modules.entries()) {
    let code = module.code
    for (const [dependencyPath, url] of paths) {
      const dependencyIndex = payload.modules.findIndex(
        candidate => candidate.path === dependencyPath,
      )
      if (dependencyIndex !== -1) {
        code = code.replaceAll(previewModulePlaceholder(dependencyIndex), url)
      }
    }
    const url = URL.createObjectURL(
      new Blob([code], { type: 'text/javascript' }),
    )
    activeUrls.push(url)
    paths.set(module.path, url)
  }
  const entry = paths.get(payload.entryPath)
  if (!entry) throw new Error('Compiled playground entry was not linked.')
  return entry
}

function injectStyles(payload: PlaygroundPreviewPayload): void {
  for (const style of payload.styles) {
    const element = document.createElement('style')
    element.dataset.path = style.path
    element.textContent = style.content
    document.head.append(element)
    activeStyles.push(element)
  }
}

function mountFallbackComponent(namespace: Record<string, unknown>): void {
  if (root!.childNodes.length > 0) return
  const elementTag = findCustomElementTag(namespace)
  if (elementTag) {
    const element = document.createElement(elementTag)
    root!.append(element)
    return
  }
  const component =
    [namespace.default, namespace.App, namespace.Counter].find(
      (value): value is () => unknown => typeof value === 'function',
    ) ??
    Object.values(namespace).find(
      (value): value is () => unknown => typeof value === 'function',
    )
  if (!component) {
    throw new Error('The preview entry does not export a component.')
  }
  disposePreview = zeus.render(component as () => any, root!)
}

function findCustomElementTag(
  namespace: Record<string, unknown>,
): string | undefined {
  for (const value of Object.values(namespace)) {
    if (
      typeof value === 'function' &&
      typeof (value as { tagName?: unknown }).tagName === 'string'
    ) {
      const tag = (value as unknown as { tagName: string }).tagName
      if (typeof tag === 'string') return tag
    }
  }
  return undefined
}

function stop(): void {
  generation += 1
  stopLoadedPreview()
  revokeUrls()
  clearStyles()
  root?.replaceChildren()
}

function stopLoadedPreview(): void {
  disposeHostPreview?.()
  disposeHostPreview = undefined
  devtools?.disconnect()
  devtools = undefined
  if (!disposePreview) return
  try {
    disposePreview()
  } finally {
    disposePreview = undefined
  }
}

async function runHostPreview(
  message: Extract<PlaygroundSandboxMessage, { kind: 'sandbox-host-preview' }>,
): Promise<void> {
  try {
    if (!customElements.get(message.tag)) {
      throw new Error(`Custom element <${message.tag}> is not registered.`)
    }
    disposeHostPreview?.()
    const hostRoot = document.createElement('section')
    hostRoot.id = 'zeus-framework-hosts'
    const reactHost = document.createElement('section')
    reactHost.dataset.testid = 'sandbox-react-host'
    const vueHost = document.createElement('section')
    vueHost.dataset.testid = 'sandbox-vue-host'
    hostRoot.append(reactHost, vueHost)
    document.body.append(hostRoot)
    const reactRoot = createRoot(reactHost)
    flushSync(() => {
      reactRoot.render(
        createElement(
          'div',
          null,
          createElement('h2', null, 'React'),
          createElement(message.tag, { count: 3, label: 'React' }),
        ),
      )
    })
    const VueApp = defineComponent({
      name: 'SandboxVueHost',
      render: () =>
        h('div', null, [
          h('h2', null, 'Vue'),
          h(message.tag, { count: 7, label: 'Vue' }),
        ]),
    })
    createApp(VueApp).mount(vueHost)
    disposeHostPreview = () => {
      reactRoot.unmount()
      hostRoot.remove()
    }
    window.parent.postMessage(
      {
        channel: PLAYGROUND_SANDBOX_CHANNEL,
        version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
        kind: 'sandbox-host-result',
        sessionId,
        requestId: message.requestId,
        react: true,
        vue: true,
      },
      trustedParentOrigin ?? '*',
    )
  } catch (error) {
    window.parent.postMessage(
      {
        channel: PLAYGROUND_SANDBOX_CHANNEL,
        version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
        kind: 'sandbox-error',
        sessionId,
        requestId: message.requestId,
        code: 'ZEUS_PLAYGROUND_HOST_PREVIEW',
        message: errorMessage(error),
      },
      trustedParentOrigin ?? '*',
    )
  }
}

function revokeUrls(): void {
  for (const url of activeUrls) URL.revokeObjectURL(url)
  activeUrls = []
}

function clearStyles(): void {
  for (const style of activeStyles) style.remove()
  activeStyles = []
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

interface SandboxDevtools {
  snapshot(): PlaygroundSandboxDevtools
  disconnect(): void
}

function createSandboxDevtools(): SandboxDevtools {
  const counts = {
    eventCount: 0,
    owners: new Set<number>(),
    components: new Set<number>(),
    bindings: new Set<number>(),
    effects: new Set<number>(),
    sources: new Set<number>(),
    customElements: new Set<number>(),
  }
  const timeline: Array<{
    id: number
    timestamp: number
    type: string
    reason?: string
    name?: string
  }> = []
  let nextEventId = 1
  let active = true
  let runtimeObserved = false
  const previousHook = window.__ZEUS_DEVTOOLS_HOOK__
  const hook = {
    emit(event: {
      type: string
      timestamp?: number
      ownerId?: number
      componentId?: number
      bindingId?: number
      effectId?: number
      sourceId?: number
      targetId?: number
      name?: string
      payload?: Readonly<Record<string, unknown>>
    }): void {
      if (!active) return
      runtimeObserved = true
      counts.eventCount += 1
      if (event.ownerId !== undefined) counts.owners.add(event.ownerId)
      if (event.componentId !== undefined)
        counts.components.add(event.componentId)
      if (event.bindingId !== undefined) counts.bindings.add(event.bindingId)
      if (event.effectId !== undefined) counts.effects.add(event.effectId)
      if (event.sourceId !== undefined) counts.sources.add(event.sourceId)
      if (event.type.startsWith('custom-element:')) {
        const id = event.targetId ?? event.name
        if (id !== undefined) {
          const target =
            typeof id === 'number'
              ? id
              : [...counts.customElements].length + 1_000_000
          counts.customElements.add(target)
        }
      }
      if (
        event.type === 'hmr:patch' ||
        event.type === 'hmr:invalidate' ||
        event.type === 'hmr:dispose'
      ) {
        const reason =
          typeof event.payload?.reason === 'string'
            ? event.payload.reason
            : undefined
        timeline.push({
          id: nextEventId++,
          timestamp: event.timestamp ?? performance.now(),
          type: event.type,
          ...(reason === undefined ? {} : { reason }),
          ...(event.name === undefined ? {} : { name: event.name }),
        })
      }
      previousHook?.emit?.(event as never)
    },
  }
  window.__ZEUS_DEVTOOLS_HOOK__ = hook as never
  return {
    snapshot() {
      let domNodeCount = 0
      let textNodeCount = 0
      let elementCount = 0
      if (root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL)
        let node = walker.nextNode()
        while (node) {
          domNodeCount += 1
          if (node.nodeType === Node.TEXT_NODE) textNodeCount += 1
          if (node.nodeType === Node.ELEMENT_NODE) elementCount += 1
          node = walker.nextNode()
        }
      }
      return {
        mode: runtimeObserved ? 'runtime' : 'structural',
        eventCount: counts.eventCount,
        ownerCount: counts.owners.size,
        componentCount: counts.components.size,
        bindingCount: counts.bindings.size,
        effectCount: counts.effects.size,
        sourceCount: counts.sources.size,
        customElementCount: counts.customElements.size,
        domNodeCount,
        textNodeCount,
        elementCount,
        timeline: timeline.slice(-64),
      }
    },
    disconnect() {
      active = false
      if (window.__ZEUS_DEVTOOLS_HOOK__ === hook) {
        if (previousHook) window.__ZEUS_DEVTOOLS_HOOK__ = previousHook
        else delete window.__ZEUS_DEVTOOLS_HOOK__
      }
    },
  }
}
