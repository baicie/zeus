// Loader for the WebAssembly build of the Zeus compiler. It only moves JSON
// across linear memory; every transform runs the shared Rust compiler.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** URL of the compiler binary, resolvable by bundlers that understand `new URL(..., import.meta.url)`. */
export const wasmURL = new URL('./zeus-compiler.wasm', import.meta.url)

/**
 * Compiles the compiler binary. Accepts the bytes, a `Response` (or a promise
 * of one) such as `fetch(wasmURL)`, or an already compiled module.
 */
export async function compileCompilerModule(source) {
  const resolved = await source
  if (resolved instanceof WebAssembly.Module) return resolved
  if (typeof Response !== 'undefined' && resolved instanceof Response) {
    return typeof WebAssembly.compileStreaming === 'function'
      ? WebAssembly.compileStreaming(resolved)
      : WebAssembly.compile(await resolved.arrayBuffer())
  }
  return WebAssembly.compile(resolved)
}

/**
 * Creates a compiler backed by its own WebAssembly instance.
 *
 * A trap (for example a stack overflow on pathological input) leaves the
 * instance unusable, so it is discarded and the next call starts a fresh one.
 */
export async function loadCompiler(source) {
  const module = await compileCompilerModule(source)
  let instance = await WebAssembly.instantiate(module, {})

  return {
    async transformModule(options) {
      instance ??= await WebAssembly.instantiate(module, {})
      const current = instance
      let response
      try {
        response = callTransform(current.exports, options)
      } catch (error) {
        if (instance === current) instance = undefined
        throw new Error(
          `[ZEUS_COMPILER_WASM_TRAP] The Zeus compiler stopped while transforming ${String(options?.filename)}.`,
          { cause: error },
        )
      }
      if (response.status === 'error') throw new TypeError(response.message)
      return response.result
    },
  }
}

function callTransform(exports, options) {
  const request = encoder.encode(JSON.stringify(options))
  const pointer = exports.zeus_alloc(request.length)
  new Uint8Array(exports.memory.buffer, pointer, request.length).set(request)

  const packed = exports.zeus_transform(pointer, request.length)
  const responsePointer = Number(packed >> 32n)
  const responseLength = Number(packed & 0xffffffffn)
  // Decoding copies the bytes, so the buffer can be released immediately.
  const text = decoder.decode(
    new Uint8Array(exports.memory.buffer, responsePointer, responseLength),
  )
  exports.zeus_free(responsePointer, responseLength)
  return JSON.parse(text)
}

/**
 * Runs the compiler in a dedicated Worker started from `@zeus-js/compiler-wasm/worker`.
 *
 * A transform that exceeds `timeout` milliseconds terminates the Worker and
 * rejects every pending request; create a new compiler afterwards.
 */
export function createWorkerCompiler(
  worker,
  module,
  { timeout = 10_000 } = {},
) {
  const pending = new Map()
  let nextId = 0
  let terminated = false

  const terminate = reason => {
    if (terminated) return
    terminated = true
    worker.terminate()
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer)
      reject(reason)
    }
    pending.clear()
  }

  worker.addEventListener('message', ({ data }) => {
    const request = pending.get(data.id)
    if (!request) return
    pending.delete(data.id)
    clearTimeout(request.timer)
    if (data.error) {
      const ErrorType = data.error.name === 'TypeError' ? TypeError : Error
      request.reject(new ErrorType(data.error.message))
    } else {
      request.resolve(data.result)
    }
  })
  worker.addEventListener('error', event => {
    event.preventDefault?.()
    terminate(
      new Error(
        `[ZEUS_COMPILER_WORKER_ERROR] ${event.message ?? 'Worker failed.'}`,
      ),
    )
  })
  worker.postMessage({ type: 'init', module })

  return {
    transformModule(options) {
      if (terminated) {
        return Promise.reject(
          new Error(
            '[ZEUS_COMPILER_WORKER_TERMINATED] Create a new compiler Worker.',
          ),
        )
      }
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            terminate(
              new Error(
                `[ZEUS_COMPILER_WORKER_TIMEOUT] Transform exceeded ${timeout} ms and the Worker was terminated.`,
              ),
            ),
          timeout,
        )
        pending.set(id, { resolve, reject, timer })
        worker.postMessage({ type: 'transform', id, options })
      })
    },
    terminate() {
      terminate(
        new Error(
          '[ZEUS_COMPILER_WORKER_TERMINATED] The compiler Worker was terminated.',
        ),
      )
    },
  }
}
