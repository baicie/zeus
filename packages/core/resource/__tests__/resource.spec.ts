import { createEffect, createRoot, createSignal } from '@zeus-js/signal'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createResource } from '../src'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('@zeus-js/resource', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps late responses from overwriting the latest source', async () => {
    const requests: ReturnType<typeof deferred<string>>[] = []
    const resource = createResource('key', () => {
      const request = deferred<string>()
      requests.push(request)
      return request.promise
    })

    const newer = resource.refetch()
    requests[1]!.resolve('new')
    await expect(newer).resolves.toBe('new')
    requests[0]!.resolve('old')
    await expect(vi.waitFor(() => expect(resource.data()).toBe('new'))).resolves

    expect(resource.data()).toBe('new')
    expect(resource.status()).toBe('success')
    resource.dispose()
  })

  it('does not reload an accessor source when its request state changes', async () => {
    const [source, setSource] = createSignal('first')
    const fetcher = vi.fn(async (value: string) => `${value} result`)
    let resource!: ReturnType<typeof createResource<string, string>>
    let dispose!: () => void

    createRoot(stop => {
      dispose = stop
      resource = createResource(source, fetcher)
    })

    await vi.waitFor(() => expect(resource.data()).toBe('first result'))
    expect(fetcher).toHaveBeenCalledTimes(1)

    setSource('second')
    await vi.waitFor(() => expect(resource.data()).toBe('second result'))
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(resource.pending()).toBe(false)

    dispose()
  })

  it('does not let a static resource rerun its creating effect', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('unavailable'))
    let runs = 0
    let resource!: ReturnType<typeof createResource<string, string>>
    let dispose!: () => void

    createRoot(stop => {
      dispose = stop
      createEffect(() => {
        runs += 1
        resource = createResource('static', fetcher)
      })
    })

    await vi.waitFor(() => expect(resource.status()).toBe('error'))
    expect(runs).toBe(1)
    expect(fetcher).toHaveBeenCalledTimes(1)

    dispose()
  })

  it('can refetch from an effect without subscribing to its own state', async () => {
    const [trigger, setTrigger] = createSignal(0)
    let requestCount = 0
    const fetcher = vi.fn(async () => `result-${++requestCount}`)
    let resource!: ReturnType<typeof createResource<string, string>>
    let effectRuns = 0
    const refetchErrors: unknown[] = []
    let dispose!: () => void

    createRoot(stop => {
      dispose = stop
      resource = createResource('static', fetcher)
      createEffect(() => {
        trigger()
        effectRuns += 1
        void resource.refetch().catch(error => refetchErrors.push(error))
      })
    })

    await vi.waitFor(() => expect(resource.data()).toBe('result-2'))
    setTrigger(1)
    await vi.waitFor(() => expect(resource.data()).toBe('result-3'))
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(effectRuns).toBe(2)
    expect(refetchErrors).toEqual([])

    dispose()
  })

  it('cancels active requests when its owner is disposed', async () => {
    const request = deferred<string>()
    const abort = vi.fn()
    let resource!: ReturnType<typeof createResource<string, string>>
    let dispose!: () => void

    createRoot(stop => {
      dispose = stop
      resource = createResource('key', (_value, context) => {
        context.signal.addEventListener('abort', abort)
        return request.promise
      })
    })
    await Promise.resolve()
    dispose()

    expect(abort).toHaveBeenCalledTimes(1)
    expect(() => resource.dispose()).not.toThrow()
  })

  it('reuses fresh cached results and marks stale data while revalidating', async () => {
    const fetcher = vi
      .fn<
        (value: string, context: { signal: AbortSignal }) => Promise<string>
      >()
      .mockResolvedValueOnce('cached')
      .mockResolvedValueOnce('fresh')
    const resource = createResource('key', fetcher, {
      staleTime: 60_000,
    })
    await vi.waitFor(() => expect(resource.success()).toBe(true))
    await resource.refetch()

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(resource.data()).toBe('cached')
    resource.dispose()
  })
})
