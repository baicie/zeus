// packages/core/runtime-ssr/src/streaming.ts
//
// Experimental streaming SSR (RFC-018). `renderToString()` stays strictly
// synchronous; this entry is opt-in and versioned separately.

import { createRoot } from '@zeus-js/signal'

import {
  createSSROwner,
  disposeSSROwner,
  runWithSSROwner,
  type SSROwner,
} from './context'
import { serializeSSRNodeChunks } from './serialize'

import type { SSRNode } from './types'

/**
 * Version of the experimental streaming protocol. Bump it when the shape of
 * [`renderToStream`] or its chunk contract changes; the synchronous
 * `renderToString()` protocol is versioned by RFC-004 instead.
 */
export const SSR_STREAMING_API_VERSION = 1

const DEFAULT_FLUSH_AT = 8 * 1024

export interface RenderToStreamOptions {
  /** Cancels the stream and disposes the request scope. */
  signal?: AbortSignal
  /**
   * Minimum number of characters buffered before a chunk is flushed.
   * Escaping runs before chunking, so a chunk never carries a partially
   * escaped value; chunks are transport units and the consumer concatenates
   * them before parsing.
   */
  flushAt?: number
}

/**
 * A streaming source: an async generator that yields already-compiled SSR
 * nodes. Each `await` between yields is real asynchronous work; the runtime
 * serializes each yielded value with the same escaping guarantees as
 * `renderToString()`.
 */
export type SSRStreamSource = AsyncIterable<SSRNode>

/**
 * Renders a tree, or an async generator of trees, into a `ReadableStream` of
 * UTF-8 chunks.
 *
 * - Backpressure is native: the source is advanced only when the stream wants
 *   another chunk, so a slow reader throttles an async generator.
 * - Aborting `signal` stops the generator, disposes its request scope and
 *   errors the stream with an `AbortError`.
 * - A source that throws after a flush leaves the already-emitted chunks
 *   readable and errors the rest of the stream.
 * - Every request gets its own context owner and reactive root, created in
 *   `start` and disposed on close, cancel or error.
 *
 * A source yields already-resolved nodes: JavaScript itself awaits a Promise
 * yielded by an async generator, so the runtime only rejects thenables that
 * reach it unresolved — a render factory that returns a Promise, or a Promise
 * inside a yielded array.
 *
 * Not supported, with explicit runtime errors: async iterables passed to
 * `renderToString()`, unresolved Promise values, and `Promise` render
 * factories.
 */
export function renderToStream(
  input: () => SSRNode | SSRStreamSource,
  options: RenderToStreamOptions = {},
): ReadableStream<Uint8Array> {
  if (typeof input !== 'function') {
    throw new TypeError('renderToStream() expects a render function.')
  }

  const { signal, flushAt = DEFAULT_FLUSH_AT } = options
  if (!Number.isFinite(flushAt) || flushAt <= 0) {
    throw new TypeError('renderToStream() flushAt must be a positive number.')
  }
  const chunkSize = Math.max(1, Math.floor(flushAt))

  if (signal?.aborted) throw createAbortError()

  const encoder = new TextEncoder()
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined
  let iterator: AsyncIterator<SSRNode> | undefined
  let chunks: Generator<string, void, undefined> | undefined
  let owner: SSROwner | undefined
  let disposeRoot: (() => void) | undefined
  let pulling: Promise<void> | undefined
  let settled = false

  const dispose = (): void => {
    if (settled) return
    settled = true
    signal?.removeEventListener('abort', handleAbort)

    const current = iterator
    iterator = undefined
    chunks = undefined

    try {
      const returned = current?.return?.()
      if (
        returned &&
        typeof (returned as PromiseLike<unknown>).then === 'function'
      ) {
        void Promise.resolve(returned).catch(() => {
          /* Cancellation must still dispose the request scope. */
        })
      }
    } catch {
      /* Cancellation must still dispose the request scope. */
    }

    try {
      disposeRoot?.()
    } catch {
      /* A failing cleanup must not replace the stream error. */
    }

    if (owner) {
      try {
        disposeSSROwner(owner)
      } catch {
        /* Owner disposal only clears stored values. */
      }
    }
  }

  const close = (): void => {
    dispose()
    controllerRef?.close()
  }

  const fail = (error: unknown): void => {
    dispose()
    controllerRef?.error(error)
  }

  const handleAbort = (): void => {
    fail(createAbortError())
  }

  signal?.addEventListener('abort', handleAbort, { once: true })

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
      owner = createSSROwner()

      try {
        // The factory runs inside a fresh reactive root so signals, memos and
        // cleanups registered during synchronous setup belong to this request
        // only. Async continuations inside a source are documented in RFC-018:
        // they run outside the ambient scope, but still inside this request's
        // context owner.
        const value = createRoot(disposeRootFn => {
          disposeRoot = disposeRootFn
          return runWithSSROwner(owner, input)
        })

        assertNotThenable(value)

        if (isAsyncIterable(value)) {
          iterator = value[Symbol.asyncIterator]()
        } else {
          chunks = serializeSSRNodeChunks(value as SSRNode, chunkSize)
        }
      } catch (error) {
        fail(error)
      }
    },

    pull(controller) {
      if (settled) return

      pulling ??= pump(controller).finally(() => {
        pulling = undefined
      })

      return pulling
    },

    cancel() {
      dispose()
    },
  })

  async function pump(
    controller: ReadableStreamDefaultController<Uint8Array>,
  ): Promise<void> {
    if (settled) return
    if (signal?.aborted) {
      fail(createAbortError())
      return
    }

    try {
      if (chunks) {
        const next = chunks.next()
        if (next.done) {
          close()
          return
        }

        controller.enqueue(encoder.encode(next.value))
        return
      }

      const current = iterator
      if (!current) return

      while (true) {
        if (signal?.aborted) {
          fail(createAbortError())
          return
        }

        // Every synchronous segment of the source runs with this request's
        // context owner, so concurrent streams never observe each other's
        // `provide()` values.
        const next = await runWithSSROwner(owner, () => current.next())
        if (settled) return

        if (next.done) {
          close()
          return
        }

        assertNotThenable(next.value)
        assertStreamNode(next.value)
        const html = serializeStreamValue(next.value)
        if (html === '') continue

        controller.enqueue(encoder.encode(html))
        return
      }
    } catch (error) {
      if (!settled) fail(error)
    }
  }
}

function serializeStreamValue(value: SSRNode): string {
  let html = ''
  for (const chunk of serializeSSRNodeChunks(value, Number.POSITIVE_INFINITY)) {
    html += chunk
  }
  return html
}

function assertNotThenable(value: unknown): void {
  if (!isPromiseLike(value)) return

  void Promise.resolve(value).catch(() => {})
  throw new TypeError(
    'renderToStream() cannot serialize a Promise; await the value before yielding it.',
  )
}

/**
 * Walks the yielded tree before serialization so a nested thenable reports the
 * streaming protocol instead of the synchronous `renderToString()` error.
 */
function assertStreamNode(value: SSRNode): void {
  if (value == null || typeof value !== 'object') return
  if (isPromiseLike(value)) {
    throw new TypeError(
      'renderToStream() cannot serialize a Promise; await the value before yielding it.',
    )
  }
  if (Array.isArray(value)) {
    for (const child of value) assertStreamNode(child)
  }
}

function isAsyncIterable(value: unknown): value is SSRStreamSource {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as Partial<AsyncIterable<SSRNode>>)[Symbol.asyncIterator] ===
      'function'
  )
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

function createAbortError(): Error {
  const error = new Error('[Zeus SSR] renderToStream() was aborted.')
  error.name = 'AbortError'
  return error
}
