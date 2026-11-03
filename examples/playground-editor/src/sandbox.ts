import * as signal from '@zeus-js/signal'
import * as runtimeDom from '@zeus-js/runtime-dom'
import * as zeus from '@zeus-js/zeus'
import {
  PLAYGROUND_SANDBOX_CHANNEL,
  PLAYGROUND_SANDBOX_MESSAGE_VERSION,
  parseSandboxMessage,
  previewModulePlaceholder,
} from '@zeus-js/playground-engine'

import type {
  PlaygroundSandboxMessage,
  PlaygroundPreviewPayload,
} from '@zeus-js/playground-engine'

import sandboxStyles from './sandbox.css?inline'

declare global {
  var __ZEUS_PLAYGROUND_RUNTIME__: Record<string, object>
}

globalThis.__ZEUS_PLAYGROUND_RUNTIME__ = {
  '@zeus-js/playground-engine': {},
  '@zeus-js/runtime-dom': runtimeDom,
  '@zeus-js/signal': signal,
  '@zeus-js/zeus': zeus,
  '@zeus-js/zeus/jsx-dev-runtime': zeus,
  '@zeus-js/zeus/jsx-runtime': zeus,
}

const sessionId = decodeURIComponent(location.hash.slice(1))
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

window.addEventListener('message', event => {
  if (event.source !== window.parent) return
  if (!/^https?:\/\//.test(event.origin)) return
  if (trustedParentOrigin && event.origin !== trustedParentOrigin) return
  const message = parseSandboxMessage(event.data)
  if (!message || message.sessionId !== sessionId) return
  trustedParentOrigin ??= event.origin
  if (message.kind === 'sandbox-load') {
    void run(message)
  } else if (message.kind === 'sandbox-stop') {
    stop()
  }
})

window.parent.postMessage(
  {
    channel: PLAYGROUND_SANDBOX_CHANNEL,
    version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
    kind: 'sandbox-ready',
    sessionId,
    capabilities: {
      opaqueOrigin:
        globalThis.origin === 'null' || document.location.origin === 'null',
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
      },
      trustedParentOrigin ?? '*',
    )
  } catch (error) {
    if (current !== generation) return
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

function stop(): void {
  generation += 1
  stopLoadedPreview()
  revokeUrls()
  clearStyles()
  root?.replaceChildren()
}

function stopLoadedPreview(): void {
  if (!disposePreview) return
  try {
    disposePreview()
  } finally {
    disposePreview = undefined
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
