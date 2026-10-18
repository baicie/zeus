import { createRoot } from '@zeus-js/signal'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createInfiniteQuery,
  createMutation,
  createQuery,
  createQueryClient,
} from '../src'

describe('@zeus-js/query', () => {
  afterEach(() => vi.restoreAllMocks())

  it('adapts query-core retry and exposes signal state', async () => {
    const client = createQueryClient()
    let attempts = 0
    const query = createQuery(client, {
      queryKey: ['retry'],
      retry: 2,
      retryDelay: 0,
      queryFn: async () => {
        attempts++
        if (attempts < 3) throw new Error('retry')
        return 'ok'
      },
    })

    await vi.waitFor(() => expect(query.success()).toBe(true))
    expect(attempts).toBe(3)
    expect(query.data()).toBe('ok')
    query.dispose()
    client.dispose()
  })

  it('supports mutation CRUD and owner disposal', async () => {
    const client = createQueryClient()
    let mutation!: ReturnType<typeof createMutation<string, { id: number }>>
    let dispose!: () => void
    createRoot(stop => {
      dispose = stop
      mutation = createMutation(client, {
        mutationFn: async ({ id }) => `saved:${id}`,
      })
    })

    await expect(mutation.mutateAsync({ id: 7 })).resolves.toBe('saved:7')
    expect(mutation.success()).toBe(true)
    dispose()
    expect(() => mutation.reset()).not.toThrow()
    client.dispose()
  })

  it('fetches infinite pages through query-core', async () => {
    const client = createQueryClient()
    const query = createInfiniteQuery(client, {
      queryKey: ['pages'],
      initialPageParam: 0,
      queryFn: async ({ pageParam }) => [pageParam],
      getNextPageParam: (lastPage, _pages, pageParam) =>
        Number(pageParam) < 1 ? Number(pageParam) + 1 : undefined,
    })

    await vi.waitFor(() => expect(query.success()).toBe(true))
    await query.fetchNextPage()
    expect(query.data()?.pages).toEqual([[0], [1]])
    query.dispose()
    client.dispose()
  })

  it('passes an abort signal to resource mutation functions', async () => {
    const client = createQueryClient()
    const abort = vi.fn()
    const mutation = createMutation(client, {
      retry: false,
      mutationFn: (_value: string, context) => {
        context.signal.addEventListener('abort', abort)
        return new Promise<string>((_resolve, reject) => {
          context.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        })
      },
    })
    const pending = mutation.mutateAsync('value')
    await mutation.cancel()
    expect(abort).toHaveBeenCalledTimes(1)
    mutation.dispose()
    client.dispose()
    await expect(pending).rejects.toThrow()
  })

  it('cancels every concurrent mutation request', async () => {
    const client = createQueryClient()
    const signals: AbortSignal[] = []
    const mutation = createMutation(client, {
      retry: false,
      mutationFn: (_value: string, context) => {
        signals.push(context.signal)
        return new Promise<string>((_resolve, reject) => {
          context.signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      },
    })

    const first = mutation.mutateAsync('first')
    const second = mutation.mutateAsync('second')
    await vi.waitFor(() => expect(signals).toHaveLength(2))
    await mutation.cancel()

    expect(signals.every(signal => signal.aborted)).toBe(true)
    await expect(Promise.all([first, second])).rejects.toThrow()
    mutation.dispose()
    client.dispose()
  })

  it('reuses the request signal across mutation retries', async () => {
    const client = createQueryClient()
    const signals: AbortSignal[] = []
    let attempts = 0
    const mutation = createMutation(client, {
      retry: 1,
      retryDelay: 0,
      mutationFn: async (_value: string, context) => {
        signals.push(context.signal)
        attempts++
        if (attempts === 1) throw new Error('retry')
        return 'saved'
      },
    })

    await expect(mutation.mutateAsync('value')).resolves.toBe('saved')
    expect(signals).toHaveLength(2)
    expect(signals[0]).toBe(signals[1])
    mutation.dispose()
    client.dispose()
  })
})
