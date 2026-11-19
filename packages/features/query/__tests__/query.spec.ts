import { QueryClient } from '@tanstack/query-core'
import { bindText, createComponent, render } from '@zeus-js/runtime-dom'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  QueryClientProvider,
  createQueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '../src'

import type { ZeusQueryClient } from '../src'
import type { JSXValue } from '@zeus-js/runtime-dom'

function waitFor(predicate: () => boolean): Promise<void> {
  return vi.waitFor(() => {
    if (!predicate()) throw new Error('Condition was not met')
  })
}

describe('@zeus-js/query', () => {
  let dom: JSDOM
  let container: HTMLElement

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    })
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('DocumentFragment', dom.window.DocumentFragment)
    container = document.createElement('div')
    document.body.append(container)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
    vi.restoreAllMocks()
  })

  function mount(
    client: ZeusQueryClient,
    children: () => JSXValue,
  ): () => void {
    return render(
      () =>
        createComponent(QueryClientProvider, {
          client,
          children,
        }),
      container,
    )
  }

  it('scopes the query client through provider context', () => {
    const client = createQueryClient()
    const other = createQueryClient()
    let seen: ZeusQueryClient | undefined

    const dispose = mount(client, () => {
      seen = useQueryClient()
      return null
    })

    expect(seen).toBe(client)
    dispose()

    const disposeOther = mount(other, () => {
      seen = useQueryClient()
      return null
    })
    expect(seen).toBe(other)
    disposeOther()

    expect(() =>
      createComponent(() => {
        useQueryClient()
        return null
      }, {}),
    ).toThrow(/QueryClientProvider/)
  })

  it('mounts and unmounts the cache listeners with each provider', () => {
    const mountSpy = vi.spyOn(QueryClient.prototype, 'mount')
    const unmountSpy = vi.spyOn(QueryClient.prototype, 'unmount')
    const client = createQueryClient()

    const first = mount(client, () => null)
    const second = mount(client, () => null)
    expect(mountSpy).toHaveBeenCalledTimes(2)
    expect(unmountSpy).not.toHaveBeenCalled()

    first()
    expect(unmountSpy).toHaveBeenCalledTimes(1)
    second()
    expect(unmountSpy).toHaveBeenCalledTimes(2)

    // The provider does not own the client: it stays usable after unmount.
    client.setQueryData(['after-unmount'], 1)
    expect(client.getQueryData(['after-unmount'])).toBe(1)
  })

  it('shares loader-prefetched data with useQuery without a second request', async () => {
    const client = createQueryClient()
    const queryFn = vi.fn(async () => ({ rows: [1] }))
    const options = { queryKey: ['users'], queryFn, staleTime: 60_000 }

    // A route loader prefetches through the same client/query key.
    await expect(client.query(options)).resolves.toEqual({ rows: [1] })

    let runs = 0
    let observed: string | undefined
    let text!: Text
    const dispose = mount(client, () => {
      runs += 1
      const query = useQuery(options)
      observed = JSON.stringify(query.data())
      text = document.createTextNode('')
      bindText(text, () => JSON.stringify(query.data() ?? null))
      return text
    })

    // The cached result is available synchronously during initialization.
    expect(observed).toBe('{"rows":[1]}')
    expect(runs).toBe(1)
    expect(queryFn).toHaveBeenCalledTimes(1)

    // Cache writes update the binding without re-running the component.
    client.setQueryData(['users'], { rows: [2] })
    await waitFor(() => text.textContent === '{"rows":[2]}')
    expect(runs).toBe(1)
    expect(queryFn).toHaveBeenCalledTimes(1)

    dispose()
    client.dispose()
  })

  it('projects query retry and status into accessors', async () => {
    const client = createQueryClient()
    let attempts = 0
    let query!: ReturnType<typeof useQuery<string>>

    const dispose = mount(client, () => {
      query = useQuery({
        queryKey: ['retry'],
        retry: 2,
        retryDelay: 0,
        queryFn: async () => {
          attempts += 1
          if (attempts < 3) throw new Error('retry')
          return 'ok'
        },
      })
      return null
    })

    await waitFor(() => query.success())
    expect(attempts).toBe(3)
    expect(query.data()).toBe('ok')
    expect(query.state().status).toBe('success')

    dispose()
    client.dispose()
  })

  it('cancels a query when the loader signal aborts', async () => {
    const client = createQueryClient()
    const controller = new AbortController()
    let seenSignal: AbortSignal | undefined
    const queryFn = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          seenSignal = signal
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )

    const pending = client
      .query({
        queryKey: ['abort'],
        queryFn,
        signal: controller.signal,
      })
      .catch(error => error)

    await waitFor(() => seenSignal !== undefined)
    controller.abort()
    await expect(pending).resolves.toMatchObject({ name: 'AbortError' })
    expect(seenSignal?.aborted).toBe(true)

    client.dispose()
  })

  it('supports optimistic updates with rollback and invalidation', async () => {
    const key = ['admin-users', 'ada']
    const client = createQueryClient()
    client.setQueryData(key, { id: 'ada', email: 'ada@old.test' })
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    let rejectSave: ((error: Error) => void) | undefined
    let mutation!: ReturnType<typeof useMutation<unknown, string>>

    const dispose = mount(client, () => {
      mutation = useMutation({
        mutationFn: () =>
          new Promise((_resolve, reject) => {
            rejectSave = reject
          }),
        onMutate: async (email, helpers) => {
          await helpers.client.cancelQueries({ queryKey: key })
          const previous = helpers.client.getQueryData(key)
          helpers.client.setQueryData(key, { id: 'ada', email })
          return previous
        },
        onError: (_error, _email, previous, helpers) => {
          helpers.client.setQueryData(key, previous)
        },
        onSettled: (_data, _error, _email, _previous, helpers) =>
          helpers.client.invalidateQueries({ queryKey: ['admin-users'] }),
      })
      return null
    })

    const pending = mutation.mutateAsync('ada@new.test')
    await waitFor(
      () =>
        (client.getQueryData(key) as { email?: string } | undefined)?.email ===
        'ada@new.test',
    )
    expect(mutation.pending()).toBe(true)

    rejectSave?.(new Error('network down'))
    await expect(pending).rejects.toThrow('network down')
    await waitFor(
      () =>
        (client.getQueryData(key) as { email?: string } | undefined)?.email ===
        'ada@old.test',
    )
    expect(mutation.errorState()).toBe(true)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin-users'] })

    dispose()
    client.dispose()
  })

  it('runs mutations and disposes their owner', async () => {
    const client = createQueryClient()
    let mutation!: ReturnType<typeof useMutation<string, { id: number }>>
    let runs = 0

    const dispose = mount(client, () => {
      runs += 1
      mutation = useMutation({
        mutationFn: async ({ id }) => `saved:${id}`,
      })
      return null
    })

    await expect(mutation.mutateAsync({ id: 7 })).resolves.toBe('saved:7')
    expect(mutation.success()).toBe(true)

    dispose()
    expect(runs).toBe(1)
    await expect(mutation.mutateAsync({ id: 8 })).rejects.toThrow('disposed')
    expect(() => mutation.reset()).not.toThrow()
    client.dispose()
  })

  it('passes an abort signal to mutation functions and cancels concurrent requests', async () => {
    const client = createQueryClient()
    const signals: AbortSignal[] = []
    let mutation!: ReturnType<typeof useMutation<string, string>>

    const dispose = mount(client, () => {
      mutation = useMutation({
        retry: false,
        mutationFn: (_value, context) => {
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
      return null
    })

    const first = mutation.mutateAsync('first')
    const second = mutation.mutateAsync('second')
    await waitFor(() => signals.length === 2)
    await mutation.cancel()

    expect(signals.every(signal => signal.aborted)).toBe(true)
    await expect(Promise.all([first, second])).rejects.toThrow()
    dispose()
    client.dispose()
  })

  it('reuses the request signal across mutation retries', async () => {
    const client = createQueryClient()
    const signals: AbortSignal[] = []
    let attempts = 0
    let mutation!: ReturnType<typeof useMutation<string, string>>

    const dispose = mount(client, () => {
      mutation = useMutation({
        retry: 1,
        retryDelay: 0,
        mutationFn: async (_value, context) => {
          signals.push(context.signal)
          attempts += 1
          if (attempts === 1) throw new Error('retry')
          return 'saved'
        },
      })
      return null
    })

    await expect(mutation.mutateAsync('value')).resolves.toBe('saved')
    expect(signals).toHaveLength(2)
    expect(signals[0]).toBe(signals[1])
    dispose()
    client.dispose()
  })

  it('fetches infinite pages through useInfiniteQuery', async () => {
    const client = createQueryClient()
    let query!: ReturnType<typeof useInfiniteQuery<number[], Error, number>>

    const dispose = mount(client, () => {
      query = useInfiniteQuery({
        queryKey: ['pages'],
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => [pageParam],
        getNextPageParam: (lastPage, _pages, pageParam) =>
          Number(pageParam) < 1 ? Number(pageParam) + 1 : undefined,
      })
      return null
    })

    await waitFor(() => query.success())
    await query.fetchNextPage()
    expect(query.data()?.pages).toEqual([[0], [1]])
    expect(query.hasNextPage()).toBe(false)

    dispose()
    client.dispose()
  })
})
