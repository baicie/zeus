import {
  PLAYGROUND_SANDBOX_CHANNEL,
  PLAYGROUND_SANDBOX_MESSAGE_VERSION,
  isOpaqueSandboxOrigin,
  parseSandboxMessage,
} from '@zeus-js/playground-engine'

import type { PlaygroundPreviewPayload } from '@zeus-js/playground-engine'

export interface PreviewRunResult {
  readonly durationMs: number
  readonly exportedNames: readonly string[]
}

export class PreviewSandboxError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PreviewSandboxError'
    this.code = code
  }
}

interface PendingRequest {
  readonly requestId: string
  readonly timer: number
  readonly resolve: (result: PreviewRunResult) => void
  readonly reject: (error: Error) => void
}

export class PreviewController {
  private frame: HTMLIFrameElement | undefined
  private sessionId = ''
  private readyState: 'error' | 'loading' | 'ready' = 'loading'
  private readyError: Error | undefined
  private ready:
    | {
        readonly promise: Promise<void>
        readonly resolve: () => void
        readonly reject: (error: Error) => void
        readonly timer: number
      }
    | undefined
  private pending: PendingRequest | undefined
  private nextRequest = 0
  private messageWindowStarted = performance.now()
  private messageCount = 0

  constructor(private readonly sandboxUrl: string) {
    window.addEventListener('message', this.handleMessage)
  }

  attach(frame: HTMLIFrameElement): void {
    this.frame = frame
    this.replaceSession()
  }

  async run(
    payload: PlaygroundPreviewPayload,
    timeoutMs: number,
  ): Promise<PreviewRunResult> {
    this.resetFrame()
    await this.waitUntilReady()
    const frame = this.frame
    const target = frame?.contentWindow
    if (!frame || !target) {
      throw new PreviewSandboxError(
        'ZEUS_PLAYGROUND_SANDBOX_UNAVAILABLE',
        'Preview sandbox is not mounted.',
      )
    }

    this.cancelPending(
      new PreviewSandboxError(
        'ZEUS_PLAYGROUND_PREVIEW_REPLACED',
        'A newer preview request replaced this one.',
      ),
    )
    const requestId = `preview-${Date.now()}-${++this.nextRequest}`
    return new Promise<PreviewRunResult>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        const error = new PreviewSandboxError(
          'ZEUS_PLAYGROUND_PREVIEW_TIMEOUT',
          `Preview exceeded ${timeoutMs} ms. The sandbox was terminated.`,
        )
        this.cancelPending(error)
        this.resetFrame()
      }, timeoutMs)
      this.pending = { requestId, timer, resolve, reject }
      target.postMessage(
        {
          channel: PLAYGROUND_SANDBOX_CHANNEL,
          version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
          kind: 'sandbox-load',
          sessionId: this.sessionId,
          requestId,
          timeoutMs,
          payload,
        },
        '*',
      )
    })
  }

  stop(): void {
    const target = this.frame?.contentWindow
    if (!target || !this.sessionId) return
    target.postMessage(
      {
        channel: PLAYGROUND_SANDBOX_CHANNEL,
        version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
        kind: 'sandbox-stop',
        sessionId: this.sessionId,
        requestId: `stop-${Date.now()}`,
      },
      '*',
    )
  }

  dispose(): void {
    this.cancelPending(
      new PreviewSandboxError(
        'ZEUS_PLAYGROUND_SANDBOX_DISPOSED',
        'Preview sandbox was disposed.',
      ),
    )
    this.failReady(
      new PreviewSandboxError(
        'ZEUS_PLAYGROUND_SANDBOX_DISPOSED',
        'Preview sandbox was disposed.',
      ),
    )
    window.removeEventListener('message', this.handleMessage)
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (!isOpaqueSandboxOrigin(event.origin)) return
    if (event.source !== this.frame?.contentWindow) return
    const now = performance.now()
    if (now - this.messageWindowStarted > 1_000) {
      this.messageWindowStarted = now
      this.messageCount = 0
    }
    this.messageCount += 1
    if (this.messageCount > 64) return
    const message = parseSandboxMessage(event.data)
    if (!message || message.sessionId !== this.sessionId) return
    if (message.kind === 'sandbox-ready') {
      if (!message.capabilities.opaqueOrigin) {
        this.failReady(
          new PreviewSandboxError(
            'ZEUS_PLAYGROUND_SANDBOX_ORIGIN',
            'Preview sandbox did not provide an opaque origin.',
          ),
        )
        return
      }
      this.readyState = 'ready'
      this.readyError = undefined
      this.resolveReady()
      return
    }
    if (!this.pending || message.requestId !== this.pending.requestId) return
    if (message.kind === 'sandbox-result') {
      const pending = this.pending
      window.clearTimeout(pending.timer)
      this.pending = undefined
      pending.resolve({
        durationMs: message.durationMs,
        exportedNames: message.exportedNames,
      })
    } else if (message.kind === 'sandbox-error') {
      this.cancelPending(new PreviewSandboxError(message.code, message.message))
    }
  }

  private waitUntilReady(): Promise<void> {
    if (this.readyState === 'ready') return Promise.resolve()
    if (this.readyState === 'error' && this.readyError) {
      return Promise.reject(this.readyError)
    }
    if (this.ready) return this.ready.promise
    if (!this.frame) {
      return Promise.reject(
        new PreviewSandboxError(
          'ZEUS_PLAYGROUND_SANDBOX_UNAVAILABLE',
          'Preview sandbox is not mounted.',
        ),
      )
    }
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    const timer = window.setTimeout(() => {
      const error = new PreviewSandboxError(
        'ZEUS_PLAYGROUND_SANDBOX_TIMEOUT',
        'Preview sandbox did not become ready.',
      )
      this.failReady(error)
      this.resetFrame()
    }, 5_000)
    this.ready = { promise, resolve, reject, timer }
    return promise
  }

  private resolveReady(): void {
    if (!this.ready) return
    const ready = this.ready
    window.clearTimeout(ready.timer)
    this.ready = undefined
    ready.resolve()
  }

  private failReady(error: Error): void {
    this.readyState = 'error'
    this.readyError = error
    if (!this.ready) return
    window.clearTimeout(this.ready.timer)
    this.ready.reject(error)
    this.ready = undefined
  }

  private cancelPending(error: Error): void {
    if (!this.pending) return
    window.clearTimeout(this.pending.timer)
    const pending = this.pending
    this.pending = undefined
    pending.reject(error)
  }

  private resetFrame(): void {
    const previous = this.frame
    if (!previous?.parentElement) return
    const replacement = previous.cloneNode(false) as HTMLIFrameElement
    replacement.removeAttribute('src')
    previous.replaceWith(replacement)
    this.frame = replacement
    this.replaceSession()
  }

  private replaceSession(): void {
    this.cancelPending(
      new PreviewSandboxError(
        'ZEUS_PLAYGROUND_PREVIEW_RESET',
        'Preview sandbox was reset.',
      ),
    )
    this.failReady(
      new PreviewSandboxError(
        'ZEUS_PLAYGROUND_PREVIEW_RESET',
        'Preview sandbox was reset.',
      ),
    )
    this.sessionId = createSessionId()
    this.readyState = 'loading'
    this.readyError = undefined
    if (!this.frame) return
    this.frame.src = `${this.sandboxUrl}#${encodeURIComponent(this.sessionId)}`
  }
}

function createSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
}
