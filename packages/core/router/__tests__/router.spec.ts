import {
  createMemoryHistory,
  type AgnosticDataRouteObject,
  type LoaderFunctionArgs,
} from '@remix-run/router'
import { createRoot, createEffect } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRouter } from '../src'

const userLoader = vi.fn(async ({ params }: LoaderFunctionArgs) => ({
  id: params.id,
}))

function routes(): AgnosticDataRouteObject[] {
  return [
    {
      id: 'root',
      path: '/',
      children: [
        {
          id: 'home',
          index: true,
        },
        {
          id: 'user',
          path: 'users/:id',
          loader: userLoader,
          hasErrorBoundary: true,
        },
      ],
    },
  ]
}

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let i = 0; i < 50; i += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error('Timed out waiting for router state')
}

describe('@zeus-js/router', () => {
  afterEach(() => {
    userLoader.mockReset()
  })

  it('exposes fine-grained location, nested matches, and params accessors', async () => {
    userLoader.mockResolvedValue({ id: '42' })
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({
        initialEntries: ['/users/42?tab=profile#bio'],
      }),
    })

    await waitFor(() => router.initialized())

    expect(router.pathname()).toBe('/users/42')
    expect(router.search()).toBe('?tab=profile')
    expect(router.hash()).toBe('#bio')
    expect(router.matches().map(match => match.route.id)).toEqual([
      'root',
      'user',
    ])
    expect(router.params()).toEqual({ id: '42' })
    expect(router.loaderData()).toEqual({ user: { id: '42' } })

    router.dispose()
  })

  it('updates signals for navigation and releases the subscription with the owner', async () => {
    userLoader.mockResolvedValue({ id: '1' })
    let router!: ReturnType<typeof createRouter>
    let stop!: () => void
    const seen: string[] = []

    createRoot(dispose => {
      stop = dispose
      router = createRouter({
        routes: routes(),
        history: createMemoryHistory({ initialEntries: ['/users/1'] }),
      })
      createEffect(() => seen.push(router.pathname()))
    })

    await waitFor(() => router.initialized())
    await router.navigate('/users/2')
    await waitFor(() => router.pathname() === '/users/2')
    expect(seen).toContain('/users/2')

    const seenBeforeDispose = seen.length
    stop()
    await router.navigate('/')
    expect(seen).toHaveLength(seenBeforeDispose)
  })

  it('surfaces loader failures through the errors accessor', async () => {
    userLoader.mockRejectedValue(new Error('user unavailable'))
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/users/7'] }),
    })

    await waitFor(() => router.initialized())
    expect(router.errors()).toEqual(
      expect.objectContaining({ user: expect.any(Error) }),
    )

    router.dispose()
  })

  it('preloads a matching route without changing the current location', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    userLoader.mockResolvedValue({ id: '7' })
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      window: dom.window as unknown as Window,
    })

    await waitFor(() => router.initialized())
    await router.preload('/users/7')

    expect(router.pathname()).toBe('/')
    expect(userLoader).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: '7' } }),
    )

    router.dispose()
    dom.window.close()
  })

  it('rejects preloads when route loading fails', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    userLoader.mockRejectedValue(new Error('preload failed'))
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      window: dom.window as unknown as Window,
    })

    await waitFor(() => router.initialized())
    await expect(router.preload('/users/8')).rejects.toThrow('preload failed')
    expect(router.errors()).toEqual(
      expect.objectContaining({ root: expect.any(Error) }),
    )

    router.dispose()
    dom.window.close()
  })

  it('settles an active preload when its router is disposed', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    userLoader.mockImplementation(
      ({ request }: LoaderFunctionArgs) =>
        new Promise<{ id: string }>((_resolve, reject) => {
          request.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          )
        }),
    )
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      window: dom.window as unknown as Window,
    })

    await waitFor(() => router.initialized())
    const preloadPromise = router.preload('/users/9')
    await waitFor(() => userLoader.mock.calls.length === 1)
    router.dispose()

    await expect(preloadPromise).rejects.toThrow('Router was disposed')
    dom.window.close()
  })

  it('supports history back/forward through the adapter', async () => {
    userLoader.mockResolvedValue({ id: '1' })
    const router = createRouter({
      routes: routes(),
      history: createMemoryHistory({ initialEntries: ['/users/1'] }),
    })

    await waitFor(() => router.initialized())
    await router.navigate('/')
    await waitFor(() => router.pathname() === '/')
    await router.navigate(-1)
    await waitFor(() => router.pathname() === '/users/1')
    expect(router.pathname()).toBe('/users/1')

    router.dispose()
  })
})
